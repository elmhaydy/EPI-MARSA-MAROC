"""
Marsa Maroc — PPE Detection Backend (Flask)
-----------------------------------------------------------------------------
Reproduit exactement la logique de `test_video.py` (aucun tracking, aucun
lissage temporel, aucun vote) — juste exposée via une API Flask pour le
frontend React :

    Frame
      │
      ▼
    YOLOv8 COCO (Person Detection)
      │
      ▼
    ROI de chaque personne (padding proportionnel, comme test_video.py)
      │
      ▼
    best_v3.pt -> Helmet / NoHelmet / Vest / NoVest
      │
      ▼
    Décision IMMÉDIATE, frame par frame :
        Helmet ET Vest détectés -> CONFORM
        Sinon                   -> NON-CONFORM

Chaque frame est traitée indépendamment des autres : pas de tracker, pas
d'historique, pas d'état "ANALYZING". Le frontend interroge simplement :

    GET  /api/detections/<camera_id>
    POST /api/upload            (multipart "video" field)
    GET  /api/health
"""

import os
import time
import threading
import uuid
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dataclasses import dataclass, field
from typing import Optional

import cv2
from flask import Flask, jsonify, request
from flask_cors import CORS
from ultralytics import YOLO

# ─── Configuration (mêmes valeurs que test_video.py) ─────────────────────────

CAMERA_SOURCES = {
    "CAM-001": "videos/CAM-001.mp4",
    "CAM-005": "videos/CAM-005.mp4",
    # Ajoutez vos autres caméras ici.
}

MODELS_DIR = "models"
os.makedirs(MODELS_DIR, exist_ok=True)

PERSON_MODEL_PATH = os.environ.get("PERSON_MODEL_PATH", "models/yolov8s.pt")
PPE_MODEL_PATH = os.environ.get("PPE_MODEL_PATH", "models/best_v3.pt")

# If local models/yolov8s.pt does not exist, use standard auto-downloading 'yolov8s.pt'
if not os.path.exists(PERSON_MODEL_PATH):
    PERSON_MODEL_PATH = "yolov8s.pt"

# If local models/best_v3.pt does not exist, fallback safely to 'yolov8n.pt'
if not os.path.exists(PPE_MODEL_PATH):
    PPE_MODEL_PATH = "yolov8n.pt"

DEVICE = os.environ.get("DEVICE", "cpu")  # "cuda:0" si vous avez un GPU NVIDIA

PERSON_CONF = float(os.environ.get("PERSON_CONFIDENCE_THRESHOLD", "0.75"))
PPE_CONF = float(os.environ.get("PPE_CONFIDENCE_THRESHOLD", "0.25"))

PERSON_IMGSZ = 640
INFERENCE_SIZE = int(os.environ.get("INFERENCE_SIZE", "640"))
PERSON_CLASS_ID = 0  # classe COCO "person"

ROI_PAD_TOP_RATIO = 0.35
ROI_PAD_SIDE_RATIO = 0.15
ROI_PAD_BOTTOM_RATIO = 0.05

FRAME_SKIP = 3
DEBUG_PPE = os.environ.get("DEBUG_PPE", "0") == "1"

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)
app.config["PROPAGATE_EXCEPTIONS"] = True
CORS(app)

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    print("GLOBAL EXCEPTION HANDLER:", e, flush=True)
    traceback.print_exc()
    return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500

# ─── Modèles ─────────────────────────────────────────────────────────────────

print("Loading YOLO models...")
try:
    person_model = YOLO(PERSON_MODEL_PATH)
    ppe_model = YOLO(PPE_MODEL_PATH)
    print("Models loaded successfully.")
except Exception as e:
    print(f"Model load note: {e}")


def normalize_ppe_label(raw_name: str) -> str:
    """Même normalisation que test_video.py: minuscule, sans tirets uniquement
    (test_video.py ne retire PAS les underscores — on ne le fait pas non plus,
    pour ne jamais faire diverger la classification helmet/vest/nohelmet/novest)."""
    return raw_name.lower().replace("-", "")


# ─── État partagé par caméra ──────────────────────────────────────────────────

@dataclass
class CameraState:
    workers: int = 0
    compliant: int = 0
    frame_width: int = 0
    frame_height: int = 0
    boxes: list = field(default_factory=list)
    last_update: float = 0.0
    running: bool = True
    error: Optional[str] = None


camera_states: dict[str, CameraState] = {}
camera_lock = threading.Lock()

# Les deux modèles (person_model, ppe_model) sont chargés UNE SEULE FOIS et
# partagés par tous les threads caméra. Ultralytics/PyTorch ne garantit pas
# la thread-safety d'appels predict() concurrents sur la même instance de
# modèle (état interne partagé : predictor, buffers, post-traitement NMS).
# Sans verrou, deux caméras qui infèrent en même temps peuvent mélanger
# leurs résultats -> "personnes" fantômes détectées sur du fond, statuts
# incohérents. Ce verrou sérialise tous les appels au modèle, exactement
# comme dans test_video.py qui, étant mono-thread, n'a jamais ce problème.
model_lock = threading.Lock()


def run_inference(frame):
    """Pipeline en une seule passe, identique à test_video.py : chaque
    frame est traitée indépendamment, sans aucun état conservé d'une frame
    à l'autre (pas de tracker, pas d'historique, pas de vote)."""
    frame_h, frame_w = frame.shape[:2]

    with model_lock:
        person_results = person_model.predict(
            frame,
            classes=[PERSON_CLASS_ID],
            conf=PERSON_CONF,
            imgsz=PERSON_IMGSZ,
            device=DEVICE,
            verbose=False,
        )

    people = []

    for person in person_results[0].boxes:
        x1, y1, x2, y2 = map(int, person.xyxy[0].tolist())
        person_conf = float(person.conf[0])

        box_w = x2 - x1
        box_h = y2 - y1

        pad_top = int(box_h * ROI_PAD_TOP_RATIO)
        pad_bottom = int(box_h * ROI_PAD_BOTTOM_RATIO)
        pad_side = int(box_w * ROI_PAD_SIDE_RATIO)

        # Comme dans test_video.py : x1,y1,x2,y2 sont ré-écrasés par la boîte
        # PADDÉE. C'est cette boîte (et pas la boîte brute de détection) qui
        # sert à la fois pour découper la ROI et comme "boîte personne" finale.
        x1 = max(0, x1 - pad_side)
        y1 = max(0, y1 - pad_top)
        x2 = min(frame_w, x2 + pad_side)
        y2 = min(frame_h, y2 + pad_bottom)

        roi = frame[y1:y2, x1:x2]
        if roi.size == 0:
            continue

        with model_lock:
            ppe_results = ppe_model.predict(
                roi,
                conf=PPE_CONF,
                imgsz=INFERENCE_SIZE,
                device=DEVICE,
                verbose=False,
            )

        helmet = vest = False
        ppe_detections = []

        for box in ppe_results[0].boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            raw_label = ppe_model.names[cls]
            normalized = normalize_ppe_label(raw_label)

            if normalized == "helmet":
                helmet = True
            elif normalized == "vest":
                vest = True

            px1, py1, px2, py2 = map(int, box.xyxy[0].tolist())
            ppe_detections.append({
                "label": raw_label,
                "bbox": [x1 + px1, y1 + py1, x1 + px2, y1 + py2],
                "conf": round(conf, 3),
                "is_negative": normalized in ("nohelmet", "novest"),
            })

        if DEBUG_PPE:
            print(f"[DEBUG_PPE] person_conf={person_conf:.2f} roi={roi.shape[1]}x{roi.shape[0]} "
                  f"helmet={helmet} vest={vest}")

        # Décision immédiate, frame par frame — exactement comme test_video.py :
        # seule la présence positive de Helmet/Vest compte.
        missing = []
        if not helmet:
            missing.append("Helmet")
        if not vest:
            missing.append("Vest")

        status = "CONFORM" if not missing else "NON-CONFORM"

        if status == "CONFORM":
            text = "CONFORM"
        elif missing == ["Helmet"]:
            text = "NON-CONFORM - Helmet Missing"
        elif missing == ["Vest"]:
            text = "NON-CONFORM - Vest Missing"
        else:
            text = "NON-CONFORM - Helmet & Vest Missing"

        people.append({
            # ── Format principal ──
            "bbox": [x1, y1, x2, y2],
            "status": status,          # "CONFORM" | "NON-CONFORM"
            "missing": missing,
            "text": text,
            "color": "green" if status == "CONFORM" else "red",
            "confidence": round(person_conf, 3),
            "ppe_detections": ppe_detections,

            # ── Compatibilité avec l'ancien frontend React (pourcentages) ──
            "x": round(x1 / frame_w * 100, 1),
            "y": round(y1 / frame_h * 100, 1),
            "w": round((x2 - x1) / frame_w * 100, 1),
            "h": round((y2 - y1) / frame_h * 100, 1),
            "label": text,
            "conf": round(person_conf * 100, 1),
            "kind": "ok" if status == "CONFORM" else "violation",
        })

    return people


def camera_worker(camera_id: str, source: str):
    is_file = not source.startswith("rtsp://")
    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        with camera_lock:
            camera_states[camera_id].error = f"Could not open source: {source}"
        return

    frame_count = 0

    while camera_states[camera_id].running:
        ok, frame = cap.read()
        if not ok:
            if is_file:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # boucle le clip
                frame_count = 0
                continue
            with camera_lock:
                camera_states[camera_id].error = "Stream ended"
            break

        frame_count += 1

        # Identique à test_video.py : une frame sur FRAME_SKIP seulement.
        if frame_count % FRAME_SKIP != 0:
            continue

        try:
            people = run_inference(frame)
        except Exception as exc:
            with camera_lock:
                camera_states[camera_id].error = str(exc)
            continue

        compliant = sum(1 for p in people if p["status"] == "CONFORM")
        frame_h, frame_w = frame.shape[:2]

        with camera_lock:
            state = camera_states[camera_id]
            state.workers = len(people)
            state.compliant = compliant
            state.frame_width = frame_w
            state.frame_height = frame_h
            state.boxes = people
            state.last_update = time.time()
            state.error = None

        time.sleep(0.03)

    cap.release()


def start_camera(camera_id: str, source: str):
    camera_states[camera_id] = CameraState()
    t = threading.Thread(target=camera_worker, args=(camera_id, source), daemon=True)
    t.start()


for cam_id, src in CAMERA_SOURCES.items():
    start_camera(cam_id, src)


# ─── Database & Auth Configuration ───────────────────────────────────────────

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import datetime

DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

DB_PATH = os.path.join(os.path.dirname(__file__), "marsa_epi.db")
SQLITE_URL = f"sqlite:///{DB_PATH}"

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL or SQLITE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "marsa_maroc_epi_secret_key_2026")

db = SQLAlchemy(app)


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(80), nullable=False, default="Officer HSE")
    terminal = db.Column(db.String(120), nullable=False, default="Tous les Terminals")
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.String(50), default=lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    last_login = db.Column(db.String(50), default="Jamais")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "terminal": self.terminal,
            "is_active": self.is_active,
            "created_at": self.created_at,
            "last_login": self.last_login,
        }


class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.String(50), nullable=False, default=lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    user_name = db.Column(db.String(120), nullable=False, default="Système")
    user_email = db.Column(db.String(120), nullable=False, default="system@marsamaroc.co.ma")
    user_role = db.Column(db.String(80), nullable=False, default="Système")
    action = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(80), nullable=False, default="Général")
    details = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(20), nullable=False, default="info")  # info, warning, critical
    ip_address = db.Column(db.String(50), nullable=True, default="127.0.0.1")

    def to_dict(self):
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "user_name": self.user_name,
            "user_email": self.user_email,
            "user_role": self.user_role,
            "action": self.action,
            "category": self.category,
            "details": self.details,
            "severity": self.severity,
            "ip_address": self.ip_address or "127.0.0.1",
        }


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.String(50), nullable=False, default=lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    title = db.Column(db.String(150), nullable=False)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(50), nullable=False, default="violation")  # violation, camera, system, security
    severity = db.Column(db.String(20), nullable=False, default="critical")  # critical, warning, info
    camera_id = db.Column(db.String(50), nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.Float, default=lambda: time.time())

    def to_dict(self):
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "title": self.title,
            "message": self.message,
            "type": self.type,
            "severity": self.severity,
            "camera_id": self.camera_id,
            "is_read": self.is_read,
            "created_at": self.created_at,
        }


def create_notification(title, message, type="violation", severity="critical", camera_id=None):
    try:
        notif = Notification(
            timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            title=title,
            message=message,
            type=type,
            severity=severity,
            camera_id=camera_id,
            is_read=False,
            created_at=time.time()
        )
        db.session.add(notif)
        db.session.commit()
        return notif
    except Exception as e:
        print(f"Error creating notification: {e}", flush=True)
        db.session.rollback()
        return None


def log_audit_event(action, category, details, user_name="Système", user_email="system@marsamaroc.co.ma", user_role="Système", severity="info", ip_address=None):
    try:
        if not ip_address and request:
            ip_address = request.remote_addr
        log_entry = AuditLog(
            timestamp=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            user_name=user_name,
            user_email=user_email,
            user_role=user_role,
            action=action,
            category=category,
            details=details,
            severity=severity,
            ip_address=ip_address or "127.0.0.1"
        )
        db.session.add(log_entry)
        db.session.commit()
    except Exception as e:
        print(f"Error logging audit event: {e}", flush=True)
        db.session.rollback()


def seed_default_users():
    if not User.query.filter_by(email="k.amrani@marsamaroc.co.ma").first():
        admin = User(
            name="Khalid Amrani",
            email="k.amrani@marsamaroc.co.ma",
            password_hash=generate_password_hash("Marsa@2026"),
            role="Administrateur HSE",
            terminal="Tous les Terminals"
        )
        db.session.add(admin)

    if not User.query.filter_by(email="superviseur.tc1@marsamaroc.co.ma").first():
        sup = User(
            name="Youssef El Mansouri",
            email="superviseur.tc1@marsamaroc.co.ma",
            password_hash=generate_password_hash("Marsa@2026"),
            role="Superviseur Portuaire",
            terminal="Terminal 1 - Conteneurs"
        )
        db.session.add(sup)

    if not User.query.filter_by(email="operateur.pc@marsamaroc.co.ma").first():
        op = User(
            name="Amine Bennis",
            email="operateur.pc@marsamaroc.co.ma",
            password_hash=generate_password_hash("Marsa@2026"),
            role="Opérateur PC",
            terminal="Terminal 2 - Vrac"
        )
        db.session.add(op)

    if not User.query.filter_by(email="dofusiyad@gmail.com").first():
        iyad_user = User(
            name="Iyad (Administrateur)",
            email="dofusiyad@gmail.com",
            password_hash=generate_password_hash("Marsa@2026"),
            role="Administrateur HSE",
            terminal="Tous les Terminals"
        )
        db.session.add(iyad_user)

    db.session.commit()


def seed_default_audit_logs():
    if AuditLog.query.first():
        return

    now = datetime.datetime.now()
    sample_logs = [
        {
            "offset_mins": 5,
            "user_name": "Khalid Amrani",
            "user_email": "k.amrani@marsamaroc.co.ma",
            "user_role": "Administrateur HSE",
            "action": "CONNEXION_REUSSIE",
            "category": "Authentification",
            "details": "Connexion au tableau de bord d'administration HSE",
            "severity": "info",
            "ip_address": "192.168.1.45"
        },
        {
            "offset_mins": 18,
            "user_name": "Système AI Engine",
            "user_email": "ai.detection@marsamaroc.co.ma",
            "user_role": "Système AI",
            "action": "VIOLATION_EPI_DETECTEE",
            "category": "Opérations HSE",
            "details": "Détection d'absence de casque sur la caméra CAM-005 (Zone Portes - TC1)",
            "severity": "critical",
            "ip_address": "192.168.1.105"
        },
        {
            "offset_mins": 32,
            "user_name": "Youssef El Mansouri",
            "user_email": "superviseur.tc1@marsamaroc.co.ma",
            "user_role": "Superviseur Portuaire",
            "action": "ACQUITTEMENT_ALERTE",
            "category": "Opérations HSE",
            "details": "Acquittement de l'alerte #ALT-8092 par l'officier de sécurité terrain",
            "severity": "info",
            "ip_address": "192.168.1.52"
        },
        {
            "offset_mins": 45,
            "user_name": "Khalid Amrani",
            "user_email": "k.amrani@marsamaroc.co.ma",
            "user_role": "Administrateur HSE",
            "action": "CREATION_UTILISATEUR",
            "category": "Gestion Utilisateurs",
            "details": "Création du compte utilisateur 'Amine Bennis' (Opérateur PC)",
            "severity": "info",
            "ip_address": "192.168.1.45"
        },
        {
            "offset_mins": 60,
            "user_name": "Inconnu",
            "user_email": "tentative.externe@unknown.ma",
            "user_role": "Visiteur",
            "action": "ECHEC_CONNEXION",
            "category": "Authentification",
            "details": "Tentative de connexion échouée (Mot de passe incorrect)",
            "severity": "warning",
            "ip_address": "10.0.4.88"
        },
        {
            "offset_mins": 90,
            "user_name": "Amine Bennis",
            "user_email": "operateur.pc@marsamaroc.co.ma",
            "user_role": "Opérateur PC",
            "action": "MODIFICATION_CAMERA",
            "category": "Configuration Système",
            "details": "Changement du seuil de confiance de la caméra CAM-001 (80% -> 75%)",
            "severity": "info",
            "ip_address": "192.168.1.60"
        },
        {
            "offset_mins": 120,
            "user_name": "Khalid Amrani",
            "user_email": "k.amrani@marsamaroc.co.ma",
            "user_role": "Administrateur HSE",
            "action": "EXPORT_RAPPORT",
            "category": "Opérations HSE",
            "details": "Génération et téléchargement du rapport mensuel d'audit de conformité EPI (Format PDF)",
            "severity": "info",
            "ip_address": "192.168.1.45"
        },
        {
            "offset_mins": 180,
            "user_name": "Système AI Engine",
            "user_email": "ai.detection@marsamaroc.co.ma",
            "user_role": "Système AI",
            "action": "CAMERA_HORS_LIGNE",
            "category": "Configuration Système",
            "details": "Perte du flux vidéo RTSP sur la caméra CAM-004 (TC1 Storage B)",
            "severity": "warning",
            "ip_address": "192.168.1.104"
        }
    ]

    for item in sample_logs:
        t = now - datetime.timedelta(minutes=item["offset_mins"])
        log = AuditLog(
            timestamp=t.strftime("%Y-%m-%d %H:%M:%S"),
            user_name=item["user_name"],
            user_email=item["user_email"],
            user_role=item["user_role"],
            action=item["action"],
            category=item["category"],
            details=item["details"],
            severity=item["severity"],
            ip_address=item["ip_address"]
        )
        db.session.add(log)
    db.session.commit()


def seed_default_notifications():
    if Notification.query.first():
        return

    now = datetime.datetime.now()
    sample_notifs = [
        {
            "offset_mins": 2,
            "title": "Alerte Casque Manquant (CAM-005)",
            "message": "Un travailleur sans casque de sécurité a été détecté dans la Zone Portes (TC1).",
            "type": "violation",
            "severity": "critical",
            "camera_id": "CAM-005",
            "is_read": False,
        },
        {
            "offset_mins": 12,
            "title": "Non-Conformité Gilet & Casque (CAM-014)",
            "message": "Violation multiple détectée au Container Yard du Terminal 3.",
            "type": "violation",
            "severity": "critical",
            "camera_id": "CAM-014",
            "is_read": False,
        },
        {
            "offset_mins": 25,
            "title": "Signal Caméra Interrompu (CAM-004)",
            "message": "La caméra TC1 Storage B n'émet plus de flux vidéo RTSP.",
            "type": "camera",
            "severity": "warning",
            "camera_id": "CAM-004",
            "is_read": False,
        },
        {
            "offset_mins": 45,
            "title": "Tentative d'accès non autorisée",
            "message": "Tentative de connexion échouée avec l'email 'tentative.externe@unknown.ma'.",
            "type": "security",
            "severity": "warning",
            "camera_id": None,
            "is_read": True,
        },
        {
            "offset_mins": 60,
            "title": "Sauvegarde Système Réussie",
            "message": "La base de données PostgreSQL / SQLite et le journal d'audit ont été sauvegardés avec succès.",
            "type": "system",
            "severity": "info",
            "camera_id": None,
            "is_read": True,
        },
    ]

    for item in sample_notifs:
        t = now - datetime.timedelta(minutes=item["offset_mins"])
        notif = Notification(
            timestamp=t.strftime("%Y-%m-%d %H:%M:%S"),
            title=item["title"],
            message=item["message"],
            type=item["type"],
            severity=item["severity"],
            camera_id=item["camera_id"],
            is_read=item["is_read"],
            created_at=time.time() - (item["offset_mins"] * 60)
        )
        db.session.add(notif)
    db.session.commit()


with app.app_context():
    try:
        db.create_all()
        seed_default_users()
        seed_default_audit_logs()
        seed_default_notifications()
        print("SQL Database (marsa_epi.db) initialized successfully, users, audit logs & notifications seeded.", flush=True)
    except Exception as err:
        print(f"DB init note: {err}", flush=True)


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    try:
        data = request.get_json() or {}
        email = data.get("email", "").strip().lower()
        password = data.get("password", "").strip()

        if not email or not password:
            log_audit_event(
                action="ECHEC_CONNEXION",
                category="Authentification",
                details="Tentative de connexion échouée : Champs incomplets",
                user_name="Inconnu",
                user_email=email or "inconnu",
                user_role="Visiteur",
                severity="warning"
            )
            return jsonify({"error": "Veuillez fournir un email et un mot de passe."}), 400

        user = db.session.query(User).filter_by(email=email).first()
        if not user or not check_password_hash(user.password_hash, password):
            log_audit_event(
                action="ECHEC_CONNEXION",
                category="Authentification",
                details=f"Tentative de connexion échouée pour l'email '{email}' (Identifiants invalides)",
                user_name="Inconnu",
                user_email=email,
                user_role="Visiteur",
                severity="warning"
            )
            return jsonify({"error": "Identifiants incorrects (email ou mot de passe invalide)."}), 401

        if not user.is_active:
            log_audit_event(
                action="CONNEXION_REFUSEE",
                category="Authentification",
                details=f"Tentative de connexion sur un compte désactivé ({user.name})",
                user_name=user.name,
                user_email=user.email,
                user_role=user.role,
                severity="warning"
            )
            return jsonify({"error": "Ce compte a été désactivé par un administrateur."}), 403

        user.last_login = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.session.commit()

        log_audit_event(
            action="CONNEXION_REUSSIE",
            category="Authentification",
            details=f"Connexion réussie de l'utilisateur {user.name} ({user.role})",
            user_name=user.name,
            user_email=user.email,
            user_role=user.role,
            severity="info"
        )

        return jsonify({
            "message": "Connexion réussie",
            "user": user.to_dict(),
            "token": f"token-{user.id}-{uuid.uuid4().hex[:12]}"
        })
    except Exception as err:
        print("auth_login error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


reset_otp_store = {}

SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "dofusiyad@gmail.com")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "rrjgrjfsxmtllelv")
SMTP_FROM = os.environ.get("SMTP_FROM", "dofusiyad@gmail.com")


def send_otp_email(recipient_email, recipient_name, otp_code):
    """Envoie un e-mail HTML professionnel contenant le code de sécurité OTP."""
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }}
        .card {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }}
        .header {{ background: #0f172a; padding: 24px; text-align: center; color: #ffffff; }}
        .header h2 {{ margin: 0; font-size: 20px; letter-spacing: 1px; color: #f97316; }}
        .content {{ padding: 32px 24px; text-align: center; color: #334155; }}
        .otp-box {{ background: #f8fafc; border: 2px dashed #f97316; border-radius: 12px; padding: 16px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0f172a; margin: 24px 0; font-family: monospace; }}
        .footer {{ background: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2>MARSA MAROC — SÉCURITÉ HSE</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Plateforme Interne d'Authentification Portuaire</p>
        </div>
        <div class="content">
          <h3 style="margin-top: 0; color: #0f172a;">Code de Sécurité à 6 Chiffres (OTP)</h3>
          <p style="font-size: 14px; line-height: 1.5; color: #475569;">
            Bonjour <strong>{recipient_name}</strong>,<br>
            Vous avez demandé la réinitialisation du mot de passe de votre compte professionnel <strong>{recipient_email}</strong>.
          </p>
          <div class="otp-box">{otp_code}</div>
          <p style="font-size: 12px; color: #ef4444; font-weight: 600;">
            ⚠️ Ce code est à usage unique et expire dans 5 minutes.
          </p>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 20px;">
            Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer ce message ou contacter immédiatement votre administrateur HSE.
          </p>
        </div>
        <div class="footer">
          Marsa Maroc © 2026 — Direction des Systèmes d'Information & Sécurité HSE
        </div>
      </div>
    </body>
    </html>
    """

    print(f"\n=======================================================", flush=True)
    print(f"📧 [EMAIL SERVICE MARSA MAROC] ENVOI D'EMAIL OTP VIA SMTP", flush=True)
    print(f"Destinataire : {recipient_name} ({recipient_email})", flush=True)
    print(f"Code OTP à 6 chiffres : {otp_code}", flush=True)
    print(f"=======================================================\n", flush=True)

    if SMTP_USER and SMTP_PASSWORD:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"🔐 Code de Sécurité OTP Marsa Maroc : {otp_code}"
            msg["From"] = SMTP_FROM
            msg["To"] = recipient_email
            msg.attach(MIMEText(html_body, "html"))

            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, recipient_email, msg.as_string())
            server.quit()
            print(f"✅ Email SMTP délivré avec succès à {recipient_email}", flush=True)
            return True
        except Exception as err:
            print(f"⚠️ Erreur d'envoi SMTP (Fallback simulation actif) : {err}", flush=True)
            return False
    else:
        print(f"ℹ️ Serveur SMTP non configuré (Mode simulation actif) : Le code OTP {otp_code} a été loggé en console backend.", flush=True)
        return True


@app.route("/api/auth/request-otp", methods=["POST"])
def request_otp():
    try:
        data = request.get_json() or {}
        email = data.get("email", "").strip().lower()

        if not email:
            return jsonify({"error": "Veuillez fournir votre email professionnel."}), 400

        user = db.session.query(User).filter_by(email=email).first()
        if not user:
            return jsonify({"error": "Aucun compte utilisateur trouvé avec cet email."}), 404

        if not user.is_active:
            return jsonify({"error": "Ce compte a été désactivé. Réinitialisation impossible."}), 403

        # Code OTP à 6 chiffres
        otp_code = f"{random.randint(100000, 999999)}"
        reset_otp_store[email] = {
            "otp": otp_code,
            "expires": time.time() + 300  # Valide 5 minutes
        }

        # Envoi de l'email
        send_otp_email(user.email, user.name, otp_code)

        log_audit_event(
            action="DEMANDE_CODE_OTP_EMAIL",
            category="Authentification",
            details=f"Envoi par email du code OTP de sécurité ({otp_code}) pour le compte '{user.name}' ({email})",
            user_name=user.name,
            user_email=user.email,
            user_role=user.role,
            severity="info"
        )

        create_notification(
            title="Code de Sécurité Envoyé par Email",
            message=f"Un e-mail contenant le code OTP {otp_code} a été envoyé à {user.email}.",
            type="security",
            severity="warning"
        )

        return jsonify({
            "message": f"Un e-mail contenant votre code de sécurité à 6 chiffres a été envoyé à {email}.",
            "email": email,
            "simulated_otp_hint": otp_code
        })
    except Exception as err:
        print("request_otp error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/auth/verify-otp-reset", methods=["POST"])
def verify_otp_reset():
    try:
        data = request.get_json() or {}
        email = data.get("email", "").strip().lower()
        otp_code = data.get("otp_code", "").strip()
        new_password = data.get("new_password", "").strip()

        if not email or not otp_code or not new_password:
            return jsonify({"error": "L'email, le code OTP et le nouveau mot de passe sont obligatoires."}), 400

        user = db.session.query(User).filter_by(email=email).first()
        if not user:
            return jsonify({"error": "Compte utilisateur introuvable."}), 404

        record = reset_otp_store.get(email)
        if not record:
            return jsonify({"error": "Aucune demande de réinitialisation trouvée. Veuillez générer un code d'abord."}), 400

        if time.time() > record["expires"]:
            reset_otp_store.pop(email, None)
            return jsonify({"error": "Le code de sécurité OTP a expiré. Veuillez régénérer un code."}), 400

        if record["otp"] != otp_code:
            log_audit_event(
                action="ECHEC_CODE_OTP",
                category="Authentification",
                details=f"Code OTP incorrect saisi ({otp_code}) pour la réinitialisation de '{email}'",
                user_name="Inconnu",
                user_email=email,
                user_role="Visiteur",
                severity="warning"
            )
            return jsonify({"error": "Code de sécurité à 6 chiffres incorrect."}), 400

        # OTP Valide -> Mise à jour sécurisée du mot de passe
        user.password_hash = generate_password_hash(new_password)
        db.session.commit()
        reset_otp_store.pop(email, None)

        log_audit_event(
            action="REINITIALISATION_MOT_DE_PASSE_SECURISEE",
            category="Authentification",
            details=f"Mot de passe réinitialisé avec succès après validation du code OTP pour '{user.name}' ({email})",
            user_name=user.name,
            user_email=user.email,
            user_role=user.role,
            severity="info"
        )

        return jsonify({
            "message": "Votre mot de passe a été réinitialisé en toute sécurité !"
        })
    except Exception as err:
        print("verify_otp_reset error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/users", methods=["GET"])
def get_users():
    try:
        users = db.session.query(User).order_by(User.id.desc()).all()
        return jsonify([u.to_dict() for u in users])
    except Exception as err:
        print("get_users error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/users", methods=["POST"])
def create_user():
    try:
        data = request.get_json() or {}
        name = data.get("name", "").strip()
        email = data.get("email", "").strip().lower()
        password = data.get("password", "").strip() or "Marsa@2026"
        role = data.get("role", "Officer HSE").strip()
        terminal = data.get("terminal", "Tous les Terminals").strip()

        if not name or not email:
            return jsonify({"error": "Le nom et l'email sont obligatoires."}), 400

        existing = db.session.query(User).filter_by(email=email).first()
        if existing:
            return jsonify({"error": "Un utilisateur avec cet email existe déjà."}), 400

        new_user = User(
            name=name,
            email=email,
            password_hash=generate_password_hash(password),
            role=role,
            terminal=terminal,
            is_active=True
        )
        db.session.add(new_user)
        db.session.commit()

        log_audit_event(
            action="CREATION_UTILISATEUR",
            category="Gestion Utilisateurs",
            details=f"Création d'un nouveau compte utilisateur : '{name}' ({email}) - Rôle: {role}",
            user_name="Administrateur",
            user_email="admin@marsamaroc.co.ma",
            user_role="Administrateur HSE",
            severity="info"
        )

        return jsonify({"message": "Utilisateur créé avec succès", "user": new_user.to_dict()}), 201
    except Exception as err:
        print("create_user error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/users/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    try:
        user = db.session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "Utilisateur introuvable"}), 404

        data = request.get_json() or {}
        if "name" in data: user.name = data["name"].strip()
        if "role" in data: user.role = data["role"].strip()
        if "terminal" in data: user.terminal = data["terminal"].strip()
        if "is_active" in data: user.is_active = bool(data["is_active"])
        if "password" in data and data["password"].strip():
            user.password_hash = generate_password_hash(data["password"].strip())

        db.session.commit()

        log_audit_event(
            action="MODIFICATION_UTILISATEUR",
            category="Gestion Utilisateurs",
            details=f"Mise à jour des informations de l'utilisateur '{user.name}' ({user.email})",
            user_name="Administrateur",
            user_email="admin@marsamaroc.co.ma",
            user_role="Administrateur HSE",
            severity="info"
        )

        return jsonify({"message": "Utilisateur mis à jour", "user": user.to_dict()})
    except Exception as err:
        print("update_user error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
def delete_user(user_id):
    try:
        user = db.session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "Utilisateur introuvable"}), 404

        deleted_name = user.name
        deleted_email = user.email

        db.session.delete(user)
        db.session.commit()

        log_audit_event(
            action="SUPPRESSION_UTILISATEUR",
            category="Gestion Utilisateurs",
            details=f"Suppression du compte utilisateur '{deleted_name}' ({deleted_email})",
            user_name="Administrateur",
            user_email="admin@marsamaroc.co.ma",
            user_role="Administrateur HSE",
            severity="warning"
        )

        return jsonify({"message": "Utilisateur supprimé"})
    except Exception as err:
        print("delete_user error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/detections/<camera_id>")
def get_detections(camera_id):
    state = camera_states.get(camera_id)
    if state is None:
        return jsonify({"error": "unknown camera_id"}), 404
    with camera_lock:
        return jsonify({
            "workers": state.workers,
            "compliant": state.compliant,
            "frame_width": state.frame_width,
            "frame_height": state.frame_height,
            "boxes": state.boxes,
            "stale": (time.time() - state.last_update) > 5 if state.last_update else True,
            "error": state.error,
        })


@app.route("/api/upload", methods=["POST"])
def upload_clip():
    file = request.files.get("video")
    if not file:
        return jsonify({"error": "no file provided"}), 400

    camera_id = f"UPLOAD-{uuid.uuid4().hex[:8]}"
    path = os.path.join(UPLOAD_DIR, f"{camera_id}.mp4")
    file.save(path)
    start_camera(camera_id, path)

    log_audit_event(
        action="TELEVERSEMENT_VIDEO",
        category="Opérations HSE",
        details=f"Téléversement d'un nouveau fichier vidéo de simulation ({file.filename}) sous l'ID {camera_id}",
        user_name="Opérateur PC",
        user_email="op.pc@marsamaroc.co.ma",
        user_role="Opérateur PC",
        severity="info"
    )

    return jsonify({"camera_id": camera_id})


@app.route("/api/audit-logs", methods=["GET"])
def get_audit_logs():
    try:
        category = request.args.get("category")
        severity = request.args.get("severity")
        search = request.args.get("search")

        query = db.session.query(AuditLog)

        if category and category != "Toutes":
            query = query.filter(AuditLog.category == category)
        if severity and severity != "Toutes":
            query = query.filter(AuditLog.severity == severity)
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(
                (AuditLog.user_name.ilike(search_pattern)) |
                (AuditLog.user_email.ilike(search_pattern)) |
                (AuditLog.action.ilike(search_pattern)) |
                (AuditLog.details.ilike(search_pattern)) |
                (AuditLog.ip_address.ilike(search_pattern))
            )

        logs = query.order_by(AuditLog.id.desc()).all()
        return jsonify([log.to_dict() for log in logs])
    except Exception as err:
        print("get_audit_logs error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/audit-logs", methods=["POST"])
def create_audit_log():
    try:
        data = request.get_json() or {}
        action = data.get("action", "").strip()
        category = data.get("category", "Général").strip()
        details = data.get("details", "").strip()
        user_name = data.get("user_name", "Système").strip()
        user_email = data.get("user_email", "system@marsamaroc.co.ma").strip()
        user_role = data.get("user_role", "Système").strip()
        severity = data.get("severity", "info").strip()

        if not action or not details:
            return jsonify({"error": "L'action et les détails sont obligatoires."}), 400

        log_audit_event(
            action=action,
            category=category,
            details=details,
            user_name=user_name,
            user_email=user_email,
            user_role=user_role,
            severity=severity,
            ip_address=request.remote_addr
        )
        return jsonify({"message": "Log d'audit enregistré"}), 201
    except Exception as err:
        print("create_audit_log error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/audit-logs/clear", methods=["DELETE"])
def clear_audit_logs():
    try:
        db.session.query(AuditLog).delete()
        db.session.commit()
        log_audit_event(
            action="PURGE_JOURNAL_AUDIT",
            category="Configuration Système",
            details="Suppression intégrale de l'historique du journal d'audit",
            user_name="Administrateur",
            user_email="admin@marsamaroc.co.ma",
            user_role="Administrateur HSE",
            severity="warning"
        )
        return jsonify({"message": "Journal d'audit réinitialisé"})
    except Exception as err:
        print("clear_audit_logs error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/audit-logs/export", methods=["GET"])
def export_audit_logs_csv():
    try:
        import csv
        import io
        from flask import make_response

        logs = db.session.query(AuditLog).order_by(AuditLog.id.desc()).all()

        output = io.StringIO()
        writer = csv.writer(output, delimiter=";")
        writer.writerow(["ID", "Horodatage", "Utilisateur", "Email", "Role", "Action", "Categorie", "Details", "Severite", "Adresse IP"])

        for log in logs:
            writer.writerow([
                log.id,
                log.timestamp,
                log.user_name,
                log.user_email,
                log.user_role,
                log.action,
                log.category,
                log.details,
                log.severity,
                log.ip_address
            ])

        response = make_response(output.getvalue().encode("utf-8-sig"))
        response.headers["Content-Disposition"] = "attachment; filename=journal_audit_marsa_epi.csv"
        response.headers["Content-type"] = "text/csv; charset=utf-8"
        return response
    except Exception as err:
        print("export_audit_logs_csv error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


# ─── Notifications Routes ───────────────────────────────────────────────────

@app.route("/api/notifications", methods=["GET"])
def get_notifications():
    try:
        unread_only = request.args.get("unread_only", "").lower() == "true"
        query = db.session.query(Notification)
        if unread_only:
            query = query.filter_by(is_read=False)
        notifs = query.order_by(Notification.id.desc()).all()
        return jsonify([n.to_dict() for n in notifs])
    except Exception as err:
        print("get_notifications error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/notifications", methods=["POST"])
def post_notification():
    try:
        data = request.get_json() or {}
        title = data.get("title", "Alerte EPI").strip()
        message = data.get("message", "").strip()
        notif_type = data.get("type", "violation").strip()
        severity = data.get("severity", "critical").strip()
        camera_id = data.get("camera_id")

        if not message:
            return jsonify({"error": "Message requis"}), 400

        notif = create_notification(
            title=title,
            message=message,
            type=notif_type,
            severity=severity,
            camera_id=camera_id
        )
        return jsonify({"message": "Notification créée", "notification": notif.to_dict()}), 201
    except Exception as err:
        print("post_notification error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/notifications/<int:notif_id>/read", methods=["POST"])
def mark_notification_read(notif_id):
    try:
        notif = db.session.query(Notification).get(notif_id)
        if not notif:
            return jsonify({"error": "Notification introuvable"}), 404
        notif.is_read = True
        db.session.commit()
        return jsonify({"message": "Notification marquée comme lue", "notification": notif.to_dict()})
    except Exception as err:
        print("mark_notification_read error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/notifications/read-all", methods=["POST"])
def mark_all_notifications_read():
    try:
        db.session.query(Notification).filter_by(is_read=False).update({Notification.is_read: True})
        db.session.commit()
        return jsonify({"message": "Toutes les notifications ont été marquées comme lues"})
    except Exception as err:
        print("mark_all_notifications_read error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/notifications/<int:notif_id>", methods=["DELETE"])
def delete_notification(notif_id):
    try:
        notif = db.session.query(Notification).get(notif_id)
        if not notif:
            return jsonify({"error": "Notification introuvable"}), 404
        db.session.delete(notif)
        db.session.commit()
        return jsonify({"message": "Notification supprimée"})
    except Exception as err:
        print("delete_notification error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/notifications/clear", methods=["DELETE"])
def clear_all_notifications():
    try:
        db.session.query(Notification).delete()
        db.session.commit()
        return jsonify({"message": "Toutes les notifications ont été supprimées"})
    except Exception as err:
        print("clear_all_notifications error:", err, flush=True)
        return jsonify({"error": str(err)}), 500


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "model": "YOLOv8s",
        "ai_engine": "active",
        "cameras": list(camera_states.keys()) if "camera_states" in globals() else []
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True)