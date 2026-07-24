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

PERSON_MODEL_PATH = os.environ.get("PERSON_MODEL_PATH", "models/yolov8s.pt")
PPE_MODEL_PATH = os.environ.get("PPE_MODEL_PATH", "models/best_v3.pt")

DEVICE = os.environ.get("DEVICE", "cpu")  # "cuda:0" si vous avez un GPU NVIDIA

PERSON_CONF = float(os.environ.get("PERSON_CONFIDENCE_THRESHOLD", "0.75"))
PPE_CONF = float(os.environ.get("PPE_CONFIDENCE_THRESHOLD", "0.25"))

# Identique à test_video.py : la détection "personne" utilise un imgsz
# fixe de 640 (constante en dur), indépendant de INFERENCE_SIZE qui, lui,
# ne sert qu'à l'étage PPE (best_v3.pt).
PERSON_IMGSZ = 640
INFERENCE_SIZE = int(os.environ.get("INFERENCE_SIZE", "640"))

PERSON_CLASS_ID = 0  # classe COCO "person"

# Padding proportionnel à la taille de la personne (identique à
# test_video.py) : plus généreux en haut pour bien inclure le casque.
ROI_PAD_TOP_RATIO = 0.35
ROI_PAD_SIDE_RATIO = 0.15
ROI_PAD_BOTTOM_RATIO = 0.05

# Identique à test_video.py : on ne traite qu'une frame sur FRAME_SKIP
# (réduit la charge et évite le ralentissement observé quand on infère
# sur 100% des frames).
FRAME_SKIP = 3

DEBUG_PPE = os.environ.get("DEBUG_PPE", "0") == "1"

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)
CORS(app)

# ─── Vérification des fichiers (identique à test_video.py) ──────────────────

if not os.path.exists(PERSON_MODEL_PATH):
    raise FileNotFoundError(f"Person model not found: {PERSON_MODEL_PATH}")

if not os.path.exists(PPE_MODEL_PATH):
    raise FileNotFoundError(f"PPE model not found: {PPE_MODEL_PATH}")

# ─── Modèles (chargés une seule fois) ────────────────────────────────────────

print("Loading models...")
person_model = YOLO(PERSON_MODEL_PATH)
ppe_model = YOLO(PPE_MODEL_PATH)
print("PPE classes:", ppe_model.names)
print("Models loaded.")


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


# ─── Routes ──────────────────────────────────────────────────────────────────

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