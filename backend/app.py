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

DB_PATH = os.path.join(os.path.dirname(__file__), "marsa_epi.db")
SQLITE_URL = f"sqlite:///{DB_PATH}"

app.config["SQLALCHEMY_DATABASE_URI"] = SQLITE_URL
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

    db.session.commit()


with app.app_context():
    try:
        db.create_all()
        seed_default_users()
        print("SQL Database (marsa_epi.db) initialized successfully & users seeded.", flush=True)
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
            return jsonify({"error": "Veuillez fournir un email et un mot de passe."}), 400

        user = db.session.query(User).filter_by(email=email).first()
        if not user or not check_password_hash(user.password_hash, password):
            return jsonify({"error": "Identifiants incorrects (email ou mot de passe invalide)."}), 401

        if not user.is_active:
            return jsonify({"error": "Ce compte a été désactivé par un administrateur."}), 403

        user.last_login = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.session.commit()

        return jsonify({
            "message": "Connexion réussie",
            "user": user.to_dict(),
            "token": f"token-{user.id}-{uuid.uuid4().hex[:12]}"
        })
    except Exception as err:
        print("auth_login error:", err, flush=True)
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

        db.session.delete(user)
        db.session.commit()
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
    return jsonify({"camera_id": camera_id})


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "cameras": list(camera_states.keys())})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True)