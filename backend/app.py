# -*- coding: utf-8 -*-
"""
Marsa Maroc — PPE Detection Backend (Flask)
"""
import psycopg2
import os
import sys
import time
import threading
import uuid
import locale
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


# ─── Routes ──────────────────────────────────────────────────────────────────

# ─── Auth Routes ──────────────────────────────────────────────────────────

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
            return jsonify({"error": "Identifiants incorrects."}), 401

        if not user.is_active:
            return jsonify({"error": "Ce compte a ete desactive."}), 403

        user.last_login = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.session.commit()

        return jsonify({
            "message": "Connexion reussie",
            "user": user.to_dict(),
            "token": f"token-{user.id}-{uuid.uuid4().hex[:12]}"
        })
    except Exception as err:
        return jsonify({"error": str(err)}), 500


# ─── User Management Routes ──────────────────────────────────────────────

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
    except Exception as err:
        return jsonify({"error": str(err)}), 500


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
def delete_user(user_id):
    try:
        user = db.session.query(User).get(user_id)
        if not user:
            return jsonify({"error": "Utilisateur introuvable"}), 404

        db.session.delete(user)
        db.session.commit()
        return jsonify({"message": "Utilisateur supprime"})
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
    return jsonify({"camera_id": camera_id})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "cameras": list(camera_states.keys())})


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