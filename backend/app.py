# -*- coding: utf-8 -*-
"""
Marsa Maroc — PPE Detection Backend (Flask)

=======
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
    ROI de chaque personne (padding proportionnel)
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
>>>>>>> 87dd2814970da705f615b1f8af22dad04c3955b0
"""
import psycopg2
import os
import sys
import time
import threading
import uuid
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dataclasses import dataclass, field
from typing import Optional
import datetime

# ─── Fix encoding issues on Windows ─────────────────────────────────────────
# Force UTF-8 encoding for stdout/stderr and file operations
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    # Set locale to UTF-8
    try:
        locale.setlocale(locale.LC_ALL, 'fr_FR.UTF-8')
    except:
        try:
            locale.setlocale(locale.LC_ALL, 'French_France.1252')
        except:
            pass

import cv2
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from ultralytics import YOLO
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    Image as RLImage,
)

from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.pagesizes import A4

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

REPORTS_DIR = os.path.join(BASE_DIR, "reports")
CHARTS_DIR = os.path.join(BASE_DIR, "charts")

os.makedirs(REPORTS_DIR, exist_ok=True)
os.makedirs(CHARTS_DIR, exist_ok=True)

# ─── Configuration ───────────────────────────────────────────────────────────

# Ensure proper encoding for file operations
os.environ['PYTHONIOENCODING'] = 'utf-8'

CAMERA_SOURCES = {
    "CAM-001": "videos/CAM-001.mp4",
    "CAM-005": "videos/CAM-005.mp4",


}

MODELS_DIR = "models"
os.makedirs(MODELS_DIR, exist_ok=True)

PERSON_MODEL_PATH = os.environ.get("PERSON_MODEL_PATH", "models/yolov8s.pt")
PPE_MODEL_PATH = os.environ.get("PPE_MODEL_PATH", "models/best_v3.pt")

if not os.path.exists(PERSON_MODEL_PATH):
    PERSON_MODEL_PATH = "yolov8s.pt"

if not os.path.exists(PPE_MODEL_PATH):
    PPE_MODEL_PATH = "yolov8n.pt"

DEVICE = os.environ.get("DEVICE", "cpu")
PERSON_CONF = float(os.environ.get("PERSON_CONFIDENCE_THRESHOLD", "0.75"))
PPE_CONF = float(os.environ.get("PPE_CONFIDENCE_THRESHOLD", "0.25"))
PERSON_IMGSZ = 640
INFERENCE_SIZE = int(os.environ.get("INFERENCE_SIZE", "640"))
PERSON_CLASS_ID = 0
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

# ─── Database Configuration ─────────────────────────────────────────────────

# Use absolute path for SQLite to avoid encoding issues
DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "marsa_epi.db")
# Use forward slashes for SQLite URL to avoid Windows path encoding issues
SQLITE_URL = f"sqlite:///{DB_PATH.replace(os.sep, '/')}"

app.config["SQLALCHEMY_DATABASE_URI"] = SQLITE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "connect_args": {"check_same_thread": False}
}
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "marsa_maroc_epi_secret_key_2026")

# PostgreSQL Configuration
POSTGRES_URL = os.environ.get(
    "POSTGRES_URL",
    "postgresql://marsa_user:zineb@localhost:5432/marsa"
)

app.config["SQLALCHEMY_BINDS"] = {
    "postgres": POSTGRES_URL,
}

db = SQLAlchemy(app)

# ─── Models ──────────────────────────────────────────────────────────────────

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


class Violation(db.Model):
    __bind_key__ = "postgres"
    __tablename__ = "violations"

    id = db.Column(db.Integer, primary_key=True)
    camera_id = db.Column(db.String(50), nullable=False, index=True)
    terminal = db.Column(db.String(120), nullable=True)
    zone = db.Column(db.String(120), nullable=True)
    worker_label = db.Column(db.String(120), nullable=False, default="Personne detectee")
    violation_type = db.Column(db.String(50), nullable=False)
    confidence = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), nullable=False, default="New")
    detected_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)
    bbox = db.Column(db.JSON, nullable=True)

    def to_dict(self):
        return {
            "id": f"ALT-{self.id:05d}",
            "worker": self.worker_label,
            "type": self.violation_type,
            "confidence": round(self.confidence, 1),
            "camera": self.camera_id,
            "terminal": self.terminal or "--",
            "zone": self.zone or "--",
            "time": self.detected_at.strftime("%H:%M:%S") if self.detected_at else "",
            "date": self.detected_at.strftime("%Y-%m-%d") if self.detected_at else "",
            "status": self.status,
        }


class ComplianceSnapshot(db.Model):
    __bind_key__ = "postgres"
    __tablename__ = "compliance_snapshots"

    id = db.Column(db.Integer, primary_key=True)
    recorded_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)
    workers_total = db.Column(db.Integer, nullable=False, default=0)
    compliant_total = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self):
        violations = max(0, self.workers_total - self.compliant_total)
        compliance_pct = (
            round((self.compliant_total / self.workers_total) * 100, 1)
            if self.workers_total else 100.0
        )
        return {
            "time": self.recorded_at.strftime("%H:%M"),
            "compliance": compliance_pct,
            "violations": violations,
        }


# ─── Create tables ──────────────────────────────────────────────────────────

def init_database():
    """Initialize database with proper error handling"""
    try:
        with app.app_context():
            # Create SQLite tables
            db.create_all()
            print("SQLite database initialized successfully.", flush=True)
    except Exception as err:
        print(f"SQLite init note: {err}", flush=True)

    try:
        with app.app_context():
            # Create PostgreSQL tables
            db.create_all(bind_key="postgres")
            print("PostgreSQL tables initialized successfully.", flush=True)
    except Exception as err:
        print(f"PostgreSQL init note: {err}", flush=True)

# ─── Seed default users ────────────────────────────────────────────────────

def seed_default_users():
    try:
        with app.app_context():
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
                    role="Operateur PC",
                    terminal="Terminal 2 - Vrac"
                )
                db.session.add(op)

            db.session.commit()
            print("Users seeded successfully.", flush=True)
    except Exception as err:
        print(f"Seed users note: {err}", flush=True)


# ─── Initialize Database ──────────────────────────────────────────────────

init_database()
seed_default_users()

# ─── YOLO Models ────────────────────────────────────────────────────────────

print("Loading YOLO models...", flush=True)
try:
    person_model = YOLO(PERSON_MODEL_PATH)
    ppe_model = YOLO(PPE_MODEL_PATH)
    print("Models loaded successfully.", flush=True)
except Exception as e:
    print(f"Model load note: {e}", flush=True)


def normalize_ppe_label(raw_name: str) -> str:
    return raw_name.lower().replace("-", "")


# ─── Camera State ──────────────────────────────────────────────────────────

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
model_lock = threading.Lock()

# NOTE: complétez/ajustez ces 6 zones pour qu'elles correspondent à vos
# vraies caméras et à votre plan de site (utilisé par la page Localisation
# du frontend pour afficher "CAM-00X — zone").
CAMERA_META = {
    "CAM-001": {"terminal": "Terminal 1", "zone": "Entrée principale"},
    "CAM-002": {"terminal": "Terminal 1", "zone": "Atelier assemblage"},
    "CAM-003": {"terminal": "Terminal 1", "zone": "Quai de chargement"},
    "CAM-004": {"terminal": "Terminal 2", "zone": "Salle de contrôle"},
    "CAM-005": {"terminal": "Terminal 2", "zone": "Stockage matériaux"},
    "CAM-006": {"terminal": "Terminal 2", "zone": "Sortie de secours"},
}


def get_camera_meta(camera_id: str) -> dict:
    return CAMERA_META.get(camera_id, {"terminal": None, "zone": None})


# ─── Anti-doublon ──────────────────────────────────────────────────────────

VIOLATION_COOLDOWN_SECONDS = int(os.environ.get("VIOLATION_COOLDOWN_SECONDS", "45"))
SNAPSHOT_INTERVAL_SECONDS = int(os.environ.get("SNAPSHOT_INTERVAL_SECONDS", "600"))

_violation_cooldowns: dict[str, float] = {}
_cooldown_lock = threading.Lock()


def _should_log_violation(camera_id: str, violation_type: str) -> bool:
    key = f"{camera_id}:{violation_type}"
    now = time.time()
    with _cooldown_lock:
        last = _violation_cooldowns.get(key, 0)
        if now - last >= VIOLATION_COOLDOWN_SECONDS:
            _violation_cooldowns[key] = now
            return True
        return False


def log_violations(camera_id: str, people: list):
    meta = get_camera_meta(camera_id)

    for idx, p in enumerate(people):
        if p["status"] != "NON-CONFORM":
            continue

        if p["missing"] == ["Helmet"]:
            v_type = "No Helmet"
        elif p["missing"] == ["Vest"]:
            v_type = "No Vest"
        else:
            v_type = "No Helmet & No Vest"

        if not _should_log_violation(camera_id, v_type):
            continue

        try:
            with app.app_context():
                violation = Violation(
                    camera_id=camera_id,
                    terminal=meta["terminal"],
                    zone=meta["zone"],
                    worker_label=f"Personne #{idx + 1}",
                    violation_type=v_type,
                    confidence=p["conf"],
                    status="New",
                    bbox=p["bbox"],
                )
                db.session.add(violation)
                db.session.commit()
        except Exception as exc:
            print(f"Violation insert error: {exc}", flush=True)


# ─── Inference Pipeline ────────────────────────────────────────────────────

def run_inference(frame):
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
            "bbox": [x1, y1, x2, y2],
            "status": status,
            "missing": missing,
            "text": text,
            "color": "green" if status == "CONFORM" else "red",
            "confidence": round(person_conf, 3),
            "ppe_detections": ppe_detections,
            "x": round(x1 / frame_w * 100, 1),
            "y": round(y1 / frame_h * 100, 1),
            "w": round((x2 - x1) / frame_w * 100, 1),
            "h": round((y2 - y1) / frame_h * 100, 1),
            "label": text,
            "conf": round(person_conf * 100, 1),
            "kind": "ok" if status == "CONFORM" else "violation",
        })

    return people



# ─── Camera Worker ─────────────────────────────────────────────────────────

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
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                frame_count = 0
                continue
            with camera_lock:
                camera_states[camera_id].error = "Stream ended"
            break

        frame_count += 1

        if frame_count % FRAME_SKIP != 0:
            continue

        try:
            people = run_inference(frame)
        except Exception as exc:
            with camera_lock:
                camera_states[camera_id].error = str(exc)
            continue
        log_detections_to_db(camera_id, people)
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

        log_violations(camera_id, people)
        time.sleep(0.03)

    cap.release()


def start_camera(camera_id: str, source: str):
    camera_states[camera_id] = CameraState()
    t = threading.Thread(target=camera_worker, args=(camera_id, source), daemon=True)
    t.start()


for cam_id, src in CAMERA_SOURCES.items():
    start_camera(cam_id, src)



# ─── Snapshot Worker ──────────────────────────────────────────────────────

def snapshot_worker():
    while True:
        time.sleep(SNAPSHOT_INTERVAL_SECONDS)
        with camera_lock:
            workers_total = sum(s.workers for s in camera_states.values())
            compliant_total = sum(s.compliant for s in camera_states.values())
        try:
            with app.app_context():
                snap = ComplianceSnapshot(
                    workers_total=workers_total,
                    compliant_total=compliant_total,
                )
                db.session.add(snap)
                db.session.commit()
        except Exception as exc:
            print(f"Snapshot insert error: {exc}", flush=True)
=======
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
>>>>>>> 87dd2814970da705f615b1f8af22dad04c3955b0


threading.Thread(target=snapshot_worker, daemon=True).start()



# ─── Error Handlers ────────────────────────────────────────────────────────

@app.errorhandler(404)
def handle_not_found(e):
    """Handle 404 errors gracefully"""
    if request.path == '/favicon.ico':
        return '', 204
    return jsonify({"error": "Not Found", "path": request.path}), 404


@app.errorhandler(Exception)
def handle_exception(e):
    """Handle all other exceptions"""
    import traceback
    print("GLOBAL EXCEPTION HANDLER:", e, flush=True)
    traceback.print_exc()
    return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500
=======
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

# ----------------------------
# Camera Model
# ----------------------------
class Camera(db.Model):
    __tablename__ = "camera"

    id = db.Column(db.Integer, primary_key=True)

    code = db.Column(db.String(50), unique=True, index=True)

    name = db.Column(db.String(120), nullable=False)

    terminal = db.Column(db.String(120), nullable=False)

    zone = db.Column(db.String(120), nullable=False)

    location = db.Column(db.String(255))

    ip_address = db.Column(db.String(100))

    port = db.Column(db.Integer)

    protocol = db.Column(db.String(20), default="RTSP")

    username = db.Column(db.String(100))

    password = db.Column(db.String(255))

    model = db.Column(db.String(100))

    resolution = db.Column(db.String(30))

    fps = db.Column(db.Integer)

    orientation = db.Column(db.String(100))


    pos_x = db.Column(db.Float)

    pos_y = db.Column(db.Float)

    status = db.Column(db.String(20), default="online")

    created_at = db.Column(
        db.String(50),
        default=lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "terminal": self.terminal,
            "zone": self.zone,
            "location": self.location,
            "ip_address": self.ip_address,
            "port": self.port,
            "protocol": self.protocol,
            "model": self.model,
            "resolution": self.resolution,
            "fps": self.fps,
            "orientation": self.orientation,
            "pos_x": self.pos_x,
            "pos_y": self.pos_y,
            "status": self.status
        }

# ----------------------------
# Detection Model
# ----------------------------

class Detection(db.Model):
    __tablename__ = "detections"

    id = db.Column(db.Integer, primary_key=True)

    camera_id = db.Column(
        db.Integer,
        db.ForeignKey("camera.id"),
        nullable=False
    )

    detection_time = db.Column(
        db.String(50),
        default=lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )

    worker_id = db.Column(db.String(50))

    helmet = db.Column(db.Boolean)

    vest = db.Column(db.Boolean)

    confidence = db.Column(db.Float)

    snapshot = db.Column(db.String(255))

    camera = db.relationship("Camera", backref="detections")

    def to_dict(self):
        return {
            "id": self.id,
            "camera_id": self.camera_id,
            "detection_time": self.detection_time,
            "worker_id": self.worker_id,
            "helmet": self.helmet,
            "vest": self.vest,
            "confidence": self.confidence,
            "snapshot": self.snapshot
        }

# ----------------------------
# Alert Model
# ----------------------------

class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)

    detection_id = db.Column(
        db.Integer,
        db.ForeignKey("detections.id"),
        nullable=False
    )

    camera_id = db.Column(
        db.Integer,
        db.ForeignKey("camera.id"),
        nullable=False
    )

    alert_type = db.Column(db.String(100))

    description = db.Column(db.Text)

    severity = db.Column(db.String(30), default="critical")

    status = db.Column(db.String(30), default="New")

    created_at = db.Column(
        db.String(50),
        default=lambda: datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )

    detection = db.relationship("Detection")

    camera = db.relationship("Camera")

    def to_dict(self):
        return {
            "id": self.id,
            "detection_id": self.detection_id,
            "camera_id": self.camera_id,
            "alert_type": self.alert_type,
            "description": self.description,
            "severity": self.severity,
            "status": self.status,
            "created_at": self.created_at
        }

DB_LOG_INTERVAL_SEC = 5     # write to DB at most once per camera every 5s
ALERT_COOLDOWN_SEC = 60     # don't spam duplicate alerts for the same camera+type

_last_db_write: dict[str, float] = {}
_last_alert: dict[str, float] = {}
_db_write_lock = threading.Lock()

# Mirrors the `cameras` array in your frontend so terminal/zone grouping
# in Reports lines up with what's shown in Camera Management.
CAMERA_METADATA = {
    "CAM-001": {"name": "TC1-Quay-North",    "terminal": "Terminal 1", "zone": "Quay Zone"},
    "CAM-002": {"name": "TC1-Quay-South",    "terminal": "Terminal 1", "zone": "Quay Zone"},
    "CAM-003": {"name": "TC1-Storage-A",     "terminal": "Terminal 1", "zone": "Storage Zone"},
    "CAM-004": {"name": "TC1-Storage-B",     "terminal": "Terminal 1", "zone": "Storage Zone"},
    "CAM-005": {"name": "TC1-Gate-Entry",    "terminal": "Terminal 1", "zone": "Gate Area"},
    "CAM-006": {"name": "TC2-Quay-East",     "terminal": "Terminal 2", "zone": "Quay Zone"},
    "CAM-007": {"name": "TC2-Quay-West",     "terminal": "Terminal 2", "zone": "Quay Zone"},
    "CAM-008": {"name": "TC2-Container-Yrd", "terminal": "Terminal 2", "zone": "Container Yard"},
    "CAM-009": {"name": "TC2-Workshop",      "terminal": "Terminal 2", "zone": "Workshop"},
    "CAM-010": {"name": "TC2-Storage-Main",  "terminal": "Terminal 2", "zone": "Storage Zone"},
    "CAM-011": {"name": "TC3-Gate-Main",     "terminal": "Terminal 3", "zone": "Gate Area"},
    "CAM-012": {"name": "TC3-Quay-A",        "terminal": "Terminal 3", "zone": "Quay Zone"},
    "CAM-013": {"name": "TC3-Quay-B",        "terminal": "Terminal 3", "zone": "Quay Zone"},
    "CAM-014": {"name": "TC3-Container-A",   "terminal": "Terminal 3", "zone": "Container Yard"},
    "CAM-015": {"name": "TC3-Container-B",   "terminal": "Terminal 3", "zone": "Container Yard"},
    "CAM-016": {"name": "TC3-Workshop-Main", "terminal": "Terminal 3", "zone": "Workshop"},
}


def get_or_create_camera(code: str) -> "Camera":
    cam = Camera.query.filter_by(code=code).first()
    if cam:
        return cam
    meta = CAMERA_METADATA.get(code, {})
    cam = Camera(
        code=code,
        name=meta.get("name", code),
        terminal=meta.get("terminal", "Non assigné"),
        zone=meta.get("zone", "Zone inconnue"),
        status="online",
    )
    db.session.add(cam)
    db.session.commit()
    return cam


def log_detections_to_db(camera_code: str, people: list):
    """Throttled persistence: at most once every DB_LOG_INTERVAL_SEC per
    camera, saves one Detection row per person seen and raises Alert +
    Notification rows for violations (with cooldown so alerts don't spam)."""
    now = time.time()
    with _db_write_lock:
        if now - _last_db_write.get(camera_code, 0) < DB_LOG_INTERVAL_SEC:
            return
        _last_db_write[camera_code] = now

    try:
        with app.app_context():
            cam = get_or_create_camera(camera_code)
            ts_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            for idx, p in enumerate(people):
                det = Detection(
                    camera_id=cam.id,
                    detection_time=ts_str,
                    worker_id=f"{camera_code}-W{idx + 1}",
                    helmet="Helmet" not in p["missing"],
                    vest="Vest" not in p["missing"],
                    confidence=p["confidence"],
                )
                db.session.add(det)
                db.session.flush()  # populate det.id before using it as a FK

                if p["status"] == "NON-CONFORM":
                    cooldown_key = f"{camera_code}:{p['text']}"
                    if now - _last_alert.get(cooldown_key, 0) >= ALERT_COOLDOWN_SEC:
                        _last_alert[cooldown_key] = now
                        severity = "critical" if len(p["missing"]) == 2 else "warning"
                        db.session.add(Alert(
                            detection_id=det.id,
                            camera_id=cam.id,
                            alert_type=p["text"],
                            description=f"Violation détectée sur {camera_code} : {p['text']}",
                            severity=severity,
                            status="New",
                        ))
                        create_notification(
                            title=f"Violation EPI ({camera_code})",
                            message=f"{p['text']} — confiance {p['confidence'] * 100:.1f}%",
                            type="violation",
                            severity=severity,
                            camera_id=camera_code,
                        )

            db.session.commit()
    except Exception as exc:
        print(f"log_detections_to_db error: {exc}", flush=True)
        db.session.rollback()


with app.app_context():
    try:
        db.create_all()
        seed_default_users()
        seed_default_audit_logs()
        seed_default_notifications()
        print("SQL Database (marsa_epi.db) initialized successfully, users, audit logs & notifications seeded.", flush=True)
    except Exception as err:
        print(f"DB init note: {err}", flush=True)
>>>>>>> 87dd2814970da705f615b1f8af22dad04c3955b0


# ─── Routes ──────────────────────────────────────────────────────────────────

# ─── Auth Routes ──────────────────────────────────────────────────────────

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
            return jsonify({"error": "Identifiants incorrects."}), 401

        if not user.is_active:
            return jsonify({"error": "Ce compte a ete desactive."}), 403
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
            "message": "Connexion reussie",
            "user": user.to_dict(),
            "token": f"token-{user.id}-{uuid.uuid4().hex[:12]}"
        })
    except Exception as err:
        return jsonify({"error": str(err)}), 500


# ─── User Management Routes ──────────────────────────────────────────────
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
            return jsonify({"error": "Un utilisateur avec cet email existe deja."}), 400

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

        return jsonify({"message": "Utilisateur cree avec succes", "user": new_user.to_dict()}), 201
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
        return jsonify({"message": "Utilisateur mis a jour", "user": user.to_dict()})

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
        return jsonify({"message": "Utilisateur supprime"})

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
        return jsonify({"error": str(err)}), 500


# ─── Dashboard Routes ─────────────────────────────────────────────────────

@app.route("/api/dashboard/overview", methods=["GET"])
def dashboard_overview():
    """Get dashboard overview statistics"""
    try:
        with camera_lock:
            online_cameras = [cid for cid, s in camera_states.items() if s.error is None]
            workers_total = sum(s.workers for s in camera_states.values())
            compliant_total = sum(s.compliant for s in camera_states.values())
            active_violations = sum(
                1 for s in camera_states.values() for b in s.boxes
                if b.get("status") == "NON-CONFORM"
            )
            cameras_total = len(camera_states)

        compliance_pct = (
            round((compliant_total / workers_total) * 100, 1) if workers_total else 100.0
        )

        return jsonify({
            "totalWorkers": workers_total,
            "compliancePct": compliance_pct,
            "activeAlerts": active_violations,
            "camerasOnline": len(online_cameras),
            "camerasTotal": cameras_total,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/dashboard/trend", methods=["GET"])
def dashboard_trend():
    """Get compliance trend for the last hours"""
    try:
        hours = int(request.args.get("hours", 24))
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=hours)
        snaps = (
            ComplianceSnapshot.query
            .filter(ComplianceSnapshot.recorded_at >= since)
            .order_by(ComplianceSnapshot.recorded_at.asc())
            .all()
        )
        return jsonify([s.to_dict() for s in snaps])
    except Exception as e:
        return jsonify([])


@app.route("/api/dashboard/recent-alerts", methods=["GET"])
def dashboard_recent_alerts():
    """Get recent alerts"""
    try:
        limit = int(request.args.get("limit", 8))
        alerts = (
            Violation.query
            .order_by(Violation.detected_at.desc())
            .limit(limit)
            .all()
        )
        return jsonify([a.to_dict() for a in alerts])
    except Exception as e:
        return jsonify([])


@app.route("/api/dashboard/violations-by-terminal", methods=["GET"])
def dashboard_violations_by_terminal():
    """Get violations grouped by terminal"""
    try:
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=24)
        rows = (
            db.session.query(
                Violation.terminal, Violation.violation_type, db.func.count(Violation.id)
            )
            .filter(Violation.detected_at >= since)
            .group_by(Violation.terminal, Violation.violation_type)
            .all()
        )

        result: dict[str, dict] = {}
        for terminal, v_type, count in rows:
            key = terminal or "Unknown"
            result.setdefault(key, {"terminal": key, "helmet": 0, "vest": 0, "both": 0})
            if v_type == "No Helmet":
                result[key]["helmet"] += count
            elif v_type == "No Vest":
                result[key]["vest"] += count
            else:
                result[key]["both"] += count

        return jsonify(list(result.values()))
    except Exception as e:
        return jsonify([])


@app.route("/api/dashboard/violation-distribution", methods=["GET"])
def dashboard_violation_distribution():
    """Get violation type distribution"""
    try:
        since = datetime.datetime.utcnow() - datetime.timedelta(hours=24)
        rows = (
            db.session.query(Violation.violation_type, db.func.count(Violation.id))
            .filter(Violation.detected_at >= since)
            .group_by(Violation.violation_type)
            .all()
        )
        counts = {"No Helmet": 0, "No Vest": 0, "Both Missing": 0}
        for v_type, count in rows:
            if v_type == "No Helmet":
                counts["No Helmet"] = count
            elif v_type == "No Vest":
                counts["No Vest"] = count
            else:
                counts["Both Missing"] = count

        with camera_lock:
            compliant_total = sum(s.compliant for s in camera_states.values())

        return jsonify([
            {"name": "No Helmet", "value": counts["No Helmet"], "color": "#ef4444"},
            {"name": "No Vest", "value": counts["No Vest"], "color": "#f97316"},
            {"name": "Both Missing", "value": counts["Both Missing"], "color": "#a855f7"},
            {"name": "Compliant", "value": compliant_total, "color": "#22c55e"},
        ])
    except Exception as e:
        return jsonify([])


# ─── Violations API (pour la page Localisation) ───────────────────────────

# Conversion entre le format stocké en base ("No Helmet", "No Vest", ...)
# et le format attendu par le composant React ("no-helmet", "no-vest", ...)
VTYPE_MAP = {
    "No Helmet": "no-helmet",
    "No Vest": "no-vest",
    "No Helmet & No Vest": "no-vest + no-helmet",
}


def violation_to_frontend_dict(v: "Violation") -> dict:
    return {
        "id": f"VIO-{v.id:05d}",
        "camera": v.camera_id,
        "zone": f"{v.terminal or '--'} – {v.zone or '--'}",
        "type": VTYPE_MAP.get(v.violation_type, v.violation_type),
        "date": v.detected_at.strftime("%d/%m/%Y") if v.detected_at else "",
        "time": v.detected_at.strftime("%H:%M:%S") if v.detected_at else "",
        # confidence est stockée en 0-1 (p["conf"] côté run_inference) donc on la
        # remonte en pourcentage, tout en restant tolérant si jamais elle est déjà en 0-100.
        "confidence": round(v.confidence * 100, 1) if v.confidence <= 1 else round(v.confidence, 1),
        "acknowledged": v.status != "New",
    }


@app.route("/api/violations", methods=["GET"])
def get_violations():
    """
    Renvoie les violations pour la page Localisation du frontend.

    Query params:
      - status=new   -> seulement les violations non acquittées
      - limit=100    -> nombre max de résultats (par défaut 100)
    """
    try:
        limit = int(request.args.get("limit", 100))
        status_filter = request.args.get("status")  # "new" | None

        query = Violation.query.order_by(Violation.detected_at.desc())
        if status_filter == "new":
            query = query.filter(Violation.status == "New")

        rows = query.limit(limit).all()
        return jsonify([violation_to_frontend_dict(v) for v in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/violations/<int:violation_id>/acknowledge", methods=["PATCH"])
def acknowledge_violation(violation_id):
    """Marque une violation comme acquittée (pour un futur bouton côté frontend)."""
    try:
        v = db.session.query(Violation).get(violation_id)
        if not v:
            return jsonify({"error": "Violation introuvable"}), 404
        v.status = "Acknowledged"
        db.session.commit()
        return jsonify({"message": "ok", "violation": violation_to_frontend_dict(v)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Detection Routes ─────────────────────────────────────────────────────

@app.route("/api/detections/<camera_id>", methods=["GET"])
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


@app.route("/api/health", methods=["GET"])
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

#-------------Report Routes------------------
def _range_bounds(range_key: str):
    now = datetime.datetime.now()
    if range_key == "daily":
        return now - datetime.timedelta(hours=24), "hour"
    if range_key == "monthly":
        return now - datetime.timedelta(weeks=4), "week"
    return now - datetime.timedelta(days=7), "day"  # weekly default


@app.route("/api/reports/summary")
def reports_summary():
    try:
        start, _ = _range_bounds(request.args.get("range", "weekly"))
        dets = Detection.query.filter(Detection.detection_time >= start.strftime("%Y-%m-%d %H:%M:%S")).all()
        total = len(dets)
        compliant = sum(1 for d in dets if d.helmet and d.vest)
        avg_conf = (sum(d.confidence or 0 for d in dets) / total) if total else 0
        return jsonify({
            "avg_compliance": round(compliant / total * 100, 1) if total else 0,
            "total_violations": total - compliant,
            "workers_monitored": total,
            "detection_accuracy": round(avg_conf * 100, 1),
        })
    except Exception as err:
        return jsonify({"error": str(err)}), 500


@app.route("/api/reports/trend")
def reports_trend():
    try:
        start, bucket = _range_bounds(request.args.get("range", "weekly"))
        dets = Detection.query.filter(Detection.detection_time >= start.strftime("%Y-%m-%d %H:%M:%S")) \
            .order_by(Detection.detection_time.asc()).all()

        buckets: dict[str, dict] = {}
        for d in dets:
            dt = datetime.datetime.strptime(d.detection_time, "%Y-%m-%d %H:%M:%S")
            key = dt.strftime("%Hh") if bucket == "hour" else (f"S{dt.isocalendar()[1]}" if bucket == "week" else dt.strftime("%a"))
            b = buckets.setdefault(key, {"total": 0, "compliant": 0})
            b["total"] += 1
            b["compliant"] += int(d.helmet and d.vest)

        return jsonify([
            {"label": k, "compliance": round(v["compliant"] / v["total"] * 100, 1) if v["total"] else 0,
             "violations": v["total"] - v["compliant"]}
            for k, v in buckets.items()
        ])
    except Exception as err:
        return jsonify({"error": str(err)}), 500


@app.route("/api/reports/by-terminal")
def reports_by_terminal():
    try:
        start, _ = _range_bounds(request.args.get("range", "weekly"))
        rows = db.session.query(Camera.terminal, Detection.helmet, Detection.vest) \
            .join(Detection, Detection.camera_id == Camera.id) \
            .filter(Detection.detection_time >= start.strftime("%Y-%m-%d %H:%M:%S")).all()

        stats: dict[str, dict] = {}
        for terminal, helmet, vest in rows:
            s = stats.setdefault(terminal, {"helmet": 0, "vest": 0, "both": 0})
            if not helmet and not vest: s["both"] += 1
            elif not helmet: s["helmet"] += 1
            elif not vest: s["vest"] += 1

        return jsonify([{"terminal": t, **v} for t, v in stats.items()])
    except Exception as err:
        return jsonify({"error": str(err)}), 500


@app.route("/api/reports/violation-types")
def reports_violation_types():
    try:
        start, _ = _range_bounds(request.args.get("range", "weekly"))
        dets = db.session.query(Detection.helmet, Detection.vest) \
            .filter(Detection.detection_time >= start.strftime("%Y-%m-%d %H:%M:%S")).all()

        return jsonify([
            {"name": "No Helmet",    "value": sum(1 for h, v in dets if not h and v), "color": "#ef4444"},
            {"name": "No Vest",      "value": sum(1 for h, v in dets if h and not v), "color": "#f97316"},
            {"name": "Both Missing", "value": sum(1 for h, v in dets if not h and not v), "color": "#a855f7"},
            {"name": "Compliant",    "value": sum(1 for h, v in dets if h and v), "color": "#22c55e"},
        ])
    except Exception as err:
        return jsonify({"error": str(err)}), 500
import matplotlib
matplotlib.use("Agg")  # backend sans interface graphique, obligatoire côté serveur
import matplotlib.pyplot as plt

CHARTS_DIR = "reports/charts"
os.makedirs(CHARTS_DIR, exist_ok=True)

ORANGE = "#f97316"
RED = "#ef4444"
PURPLE = "#a855f7"
GREEN = "#22c55e"


def generate_terminal_bar_chart(by_terminal: dict, out_path: str):
    """Bar chart : violations (casque/gilet/les deux) par terminal."""
    terminals = list(by_terminal.keys()) or ["Aucune donnée"]
    helmet = [by_terminal.get(t, {}).get("helmet", 0) for t in terminals]
    vest = [by_terminal.get(t, {}).get("vest", 0) for t in terminals]
    both = [by_terminal.get(t, {}).get("both", 0) for t in terminals]

    x = range(len(terminals))
    width = 0.25

    fig, ax = plt.subplots(figsize=(6.5, 3.2), dpi=150)
    ax.bar([i - width for i in x], helmet, width, label="Sans Casque", color=RED)
    ax.bar(x, vest, width, label="Sans Gilet", color=ORANGE)
    ax.bar([i + width for i in x], both, width, label="Les Deux", color=PURPLE)

    ax.set_xticks(list(x))
    ax.set_xticklabels(terminals, fontsize=9)
    ax.set_ylabel("Nombre de violations", fontsize=9)
    ax.legend(fontsize=8, frameon=False)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(labelsize=8)
    fig.tight_layout()
    fig.savefig(out_path, transparent=False, facecolor="white")
    plt.close(fig)


def generate_violation_pie_chart(pie_data: list, out_path: str):
    """Pie chart : répartition Conforme / Sans Casque / Sans Gilet / Les Deux."""
    labels = [d["name"] for d in pie_data if d["value"] > 0]
    values = [d["value"] for d in pie_data if d["value"] > 0]
    colors_list = [d["color"] for d in pie_data if d["value"] > 0]

    if not values:
        labels, values, colors_list = ["Aucune donnée"], [1], ["#94a3b8"]

    fig, ax = plt.subplots(figsize=(4.5, 3.5), dpi=150)
    ax.pie(
        values, labels=labels, colors=colors_list, autopct="%1.0f%%",
        startangle=90, textprops={"fontsize": 8},
        wedgeprops={"edgecolor": "white", "linewidth": 1.5},
    )
    ax.axis("equal")
    fig.tight_layout()
    fig.savefig(out_path, transparent=False, facecolor="white")
    plt.close(fig)


def generate_compliance_trend_chart(trend_data: list, out_path: str):
    """Line chart : tendance de conformité sur la période."""
    labels = [d["label"] for d in trend_data] or ["-"]
    values = [d["compliance"] for d in trend_data] or [0]

    fig, ax = plt.subplots(figsize=(6.5, 3.0), dpi=150)
    ax.plot(labels, values, color=GREEN, linewidth=2.5, marker="o", markersize=4)
    ax.fill_between(range(len(labels)), values, color=GREEN, alpha=0.1)
    ax.set_ylabel("Conformité (%)", fontsize=9)
    ax.set_ylim(0, 100)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(labelsize=8, axis="x", rotation=30)
    ax.tick_params(labelsize=8, axis="y")
    fig.tight_layout()
    fig.savefig(out_path, transparent=False, facecolor="white")
    plt.close(fig)
from reportlab.platypus import Image as RLImage


def generate_daily_report_pdf() -> str:
    now = datetime.datetime.now()
    start = now - datetime.timedelta(hours=24)
    start_str = start.strftime("%Y-%m-%d %H:%M:%S")

    with app.app_context():
        dets = Detection.query.filter(Detection.detection_time >= start_str).all()
        alerts = Alert.query.filter(Alert.created_at >= start_str).all()

        total = len(dets)
        compliant = sum(1 for d in dets if d.helmet and d.vest)
        violations = total - compliant
        compliance_pct = round(compliant / total * 100, 1) if total else 0

        # ── Répartition par terminal ──
        by_terminal = {}
        rows = db.session.query(Camera.terminal, Detection.helmet, Detection.vest) \
            .join(Detection, Detection.camera_id == Camera.id) \
            .filter(Detection.detection_time >= start_str).all()
        for terminal, helmet, vest in rows:
            t = by_terminal.setdefault(terminal, {"helmet": 0, "vest": 0, "both": 0, "total": 0})
            t["total"] += 1
            if not helmet and not vest: t["both"] += 1
            elif not helmet: t["helmet"] += 1
            elif not vest: t["vest"] += 1

        # ── Répartition par type de violation (pour le pie chart) ──
        pie_data = [
            {"name": "Conforme",     "value": compliant, "color": GREEN},
            {"name": "Sans Casque",  "value": sum(1 for d in dets if not d.helmet and d.vest), "color": RED},
            {"name": "Sans Gilet",   "value": sum(1 for d in dets if d.helmet and not d.vest), "color": ORANGE},
            {"name": "Les Deux",     "value": sum(1 for d in dets if not d.helmet and not d.vest), "color": PURPLE},
        ]

        # ── Tendance horaire (pour le line chart) ──
        buckets: dict[str, dict] = {}
        for d in dets:
            dt = datetime.datetime.strptime(d.detection_time, "%Y-%m-%d %H:%M:%S")
            key = dt.strftime("%Hh")
            b = buckets.setdefault(key, {"total": 0, "compliant": 0})
            b["total"] += 1
            b["compliant"] += int(d.helmet and d.vest)
        trend_data = [
            {"label": k, "compliance": round(v["compliant"] / v["total"] * 100, 1) if v["total"] else 0}
            for k, v in sorted(buckets.items())
        ]

    # ── Génération des graphiques en PNG ──
    ts = now.strftime("%Y%m%d_%H%M%S")
    bar_path = os.path.join(CHARTS_DIR, f"bar_{ts}.png")
    pie_path = os.path.join(CHARTS_DIR, f"pie_{ts}.png")
    trend_path = os.path.join(CHARTS_DIR, f"trend_{ts}.png")

    generate_terminal_bar_chart(by_terminal, bar_path)
    generate_violation_pie_chart(pie_data, pie_path)
    generate_compliance_trend_chart(trend_data, trend_path)

    # ── Construction du PDF ──
    filename = f"rapport_journalier_{now.strftime('%Y%m%d')}.pdf"
    path = os.path.join(REPORTS_DIR, filename)

    doc = SimpleDocTemplate(path, pagesize=A4, topMargin=1.8*cm, bottomMargin=1.8*cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleOrange", parent=styles["Title"], textColor=colors.HexColor("#f97316"), fontSize=20)
    elements = []

    elements.append(Paragraph("Marsa Maroc — Rapport Journalier EPI", title_style))
    elements.append(Paragraph(f"Période : {start.strftime('%d/%m/%Y %H:%M')} — {now.strftime('%d/%m/%Y %H:%M')}", styles["Normal"]))
    elements.append(Spacer(1, 0.5*cm))

    # ── Tableau résumé ──
    summary_data = [
        ["Indicateur", "Valeur"],
        ["Conformité moyenne", f"{compliance_pct}%"],
        ["Travailleurs détectés", str(total)],
        ["Violations", str(violations)],
        ["Alertes générées", str(len(alerts))],
    ]
    summary_table = Table(summary_data, colWidths=[9*cm, 6*cm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 0.7*cm))

    # ── Graphique : tendance de conformité ──
    elements.append(Paragraph("Tendance de Conformité", styles["Heading2"]))
    elements.append(RLImage(trend_path, width=16*cm, height=7.4*cm))
    elements.append(Spacer(1, 0.6*cm))

    # ── Graphique : violations par terminal ──
    elements.append(Paragraph("Violations par Terminal", styles["Heading2"]))
    elements.append(RLImage(bar_path, width=16*cm, height=7.9*cm))
    elements.append(Spacer(1, 0.6*cm))

    # ── Graphique : répartition des violations ──
    elements.append(Paragraph("Répartition des Violations", styles["Heading2"]))
    elements.append(RLImage(pie_path, width=11*cm, height=8.6*cm))
    elements.append(Spacer(1, 0.6*cm))

    # ── Tableau : alertes critiques récentes ──
    elements.append(Paragraph("Alertes Critiques Récentes", styles["Heading2"]))
    critical = [a for a in alerts if a.severity == "critical"][:15]
    alert_data = [["Caméra", "Type", "Heure"]]
    for a in critical:
        alert_data.append([str(a.camera_id), a.alert_type or "-", a.created_at[-8:] if a.created_at else "-"])
    if len(alert_data) == 1:
        alert_data.append(["Aucune alerte critique", "-", "-"])

    alert_table = Table(alert_data, colWidths=[5*cm, 8*cm, 4*cm])
    alert_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ef4444")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    elements.append(alert_table)

    doc.build(elements)

    # Nettoyage : les PNG temporaires ne sont plus utiles une fois le PDF construit
    for p in (bar_path, pie_path, trend_path):
        try:
            os.remove(p)
        except OSError:
            pass

    return path

import os
import smtplib

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders


def send_report_email(recipient_email, recipient_name, pdf_path):
    try:
        msg = MIMEMultipart()

        msg["Subject"] = "Daily PPE Compliance Report - Marsa Maroc"
        msg["From"] = SMTP_FROM
        msg["To"] = recipient_email

        body = f"""
Hello {recipient_name},

Please find attached today's PPE compliance report generated by the AI monitoring system.

Regards,

Marsa Maroc
HSE Monitoring System
"""

        msg.attach(MIMEText(body, "plain"))

        with open(pdf_path, "rb") as f:
            attachment = MIMEBase("application", "octet-stream")
            attachment.set_payload(f.read())

        encoders.encode_base64(attachment)

        attachment.add_header(
            "Content-Disposition",
            f'attachment; filename="{os.path.basename(pdf_path)}"'
        )

        msg.attach(attachment)

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, recipient_email, msg.as_string())
        server.quit()

        print(f"Report sent to {recipient_email}")

        return True

    except Exception as e:
        print("send_report_email:", e)

        return False

@app.route("/api/reports/send-daily", methods=["POST"])
def trigger_daily_report():
    try:
        with app.app_context():
            pdf_path = generate_daily_report_pdf()
            admins = User.query.filter(User.role.ilike("%admin%"), User.is_active == True).all()

            if not admins:
                return jsonify({"error": "Aucun administrateur HSE actif trouvé pour recevoir le rapport."}), 400

            sent_to = []
            failed = []
            for admin in admins:
                ok = send_report_email(admin.email, admin.name, pdf_path)
                (sent_to if ok else failed).append(admin.email)

            log_audit_event(
                action="ENVOI_RAPPORT_JOURNALIER_MANUEL",
                category="Opérations HSE",
                details=f"Rapport PDF envoyé manuellement à {len(sent_to)} administrateur(s)" + (f" ({len(failed)} échec(s))" if failed else ""),
                user_name="Système",
                user_role="Système",
                severity="info" if not failed else "warning"
            )

        return jsonify({
            "message": f"Rapport envoyé à {len(sent_to)} administrateur(s)",
            "sent_to": sent_to,
            "failed": failed,
        })
    except Exception as err:
        print("trigger_daily_report error:", err, flush=True)
        return jsonify({"error": str(err)}), 500
    

# ─── Favicon ──────────────────────────────────────────────────────────────

@app.route('/favicon.ico')
def favicon():
    """Return a 204 No Content response for favicon requests"""
    return '', 204


# ─── Main ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Print startup banner
    print("\n" + "="*60)
    print("Marsa Maroc — PPE Detection Backend")
    print("="*60)
    print(f"Database: {SQLITE_URL}")
    print(f"PostgreSQL: {POSTGRES_URL}")
    print(f"Models: {PERSON_MODEL_PATH}, {PPE_MODEL_PATH}")
    print(f"Device: {DEVICE}")
    print(f"Cameras: {list(CAMERA_SOURCES.keys())}")
    print("="*60)
    print("\nStarting Flask server on http://localhost:5000")
    print("Available endpoints:")
    print("  GET  /api/health")
    print("  GET  /api/dashboard/overview")
    print("  GET  /api/dashboard/trend")
    print("  GET  /api/dashboard/recent-alerts")
    print("  GET  /api/dashboard/violations-by-terminal")
    print("  GET  /api/dashboard/violation-distribution")
    print("  GET  /api/violations")
    print("  PATCH /api/violations/<id>/acknowledge")
    print("  GET  /api/detections/<camera_id>")
    print("  POST /api/upload")
    print("  POST /api/auth/login")
    print("  GET  /api/users")
    print("="*60 + "\n")

#==============================
    app.run(host="0.0.0.0", port=5000, threaded=True, debug=True, use_reloader=False)