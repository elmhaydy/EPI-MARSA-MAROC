"""
Marsa Maroc PPE Detection — Flask Inference Backend
-----------------------------------------------------------------------------
Serves real-time YOLOv8 PPE detections to the React dashboard.

Single-model pipeline (last.pt), trained on Person / Helmet / NoHelmet /
Vest / NoVest together. Each Person box is matched against the PPE boxes
whose centers fall inside it, then reduced to a single verdict:

    - "Conforme"      -> helmet AND vest both detected -> green box
    - "Non Conforme"  -> helmet missing and/or vest missing -> red box

No per-item Helmet/NoHelmet/Vest/NoVest labels are shown — only the
aggregated per-person verdict.

Each camera (a recorded CCTV clip today, an RTSP URL tomorrow) runs in its
own background thread that continuously reads frames, runs inference, and
caches the latest result in memory. The React frontend never touches OpenCV
or YOLO directly — it just polls:

    GET  /api/detections/<camera_id>
    POST /api/upload            (multipart "video" field)

Run it with:
    pip install -r requirements.txt
    $env:PERSON_MODEL_PATH="models/last.pt"
    python app.py
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

# ─── Configuration ───────────────────────────────────────────────────────────

# Map camera IDs (must match the `id` fields in the frontend's `cameras`
# array) to a video source. A source can be:
#   - a path to a local .mp4 file (today — simulates a live feed by looping)
#   - an rtsp:// URL (tomorrow, once you have real camera access — nothing
#     else in this file needs to change)
CAMERA_SOURCES = {
    "CAM-001": "videos/CAM-001.mp4",
    "CAM-005": "videos/CAM-005.mp4",
    # Add the rest of your 16 cameras here as clips become available.
    # Cameras you don't map are simply "no clip assigned" in the UI.
}

MODEL_PATH = os.environ.get("PERSON_MODEL_PATH", "models/best.pt")
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.25"))

# How far outside a person's box (as a fraction of that box's width/height)
# a helmet/vest detection's center can still fall and be considered "on"
# that person. Bump this up if helmets are getting missed (e.g. top-down
# CCTV angle where the helmet sits above the person box), lower it if
# gear is getting cross-matched to the wrong person in crowded frames.
MATCH_TOLERANCE = float(os.environ.get("MATCH_TOLERANCE", "0.1"))

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)
CORS(app)  # the Vite dev server (localhost:5173) is a different origin

# ─── Model (loaded once, shared by every camera thread) ──────────────────────

print("Loading model...")
person_model = YOLO(MODEL_PATH)
print("Model loaded.")

# Same idea as normalize_class_name() from your training notebook — adjust
# these keys to whatever your dataset's raw class names actually are.
PPE_CLASS_MAP = {
    "helmet": "Helmet", "no-helmet": "No Helmet", "no_helmet": "No Helmet", "nohelmet": "No Helmet",
    "vest": "Vest", "no-vest": "No Vest", "no_vest": "No Vest", "novest": "No Vest",
    "person": "Person",
}


def box_center_inside(inner, outer, tolerance=0.0):
    """True if the center of `inner` (x1,y1,x2,y2) falls inside `outer`,
    expanded by `tolerance` fraction on each side. Simple and robust for
    matching a small PPE box (helmet/vest) to the person box it belongs to.
    """
    ix1, iy1, ix2, iy2 = inner
    ox1, oy1, ox2, oy2 = outer
    cx, cy = (ix1 + ix2) / 2, (iy1 + iy2) / 2

    ow, oh = ox2 - ox1, oy2 - oy1
    ox1 -= ow * tolerance
    ox2 += ow * tolerance
    oy1 -= oh * tolerance
    oy2 += oh * tolerance

    return ox1 <= cx <= ox2 and oy1 <= cy <= oy2


@dataclass
class CameraState:
    workers: int = 0
    compliant: int = 0
    boxes: list = field(default_factory=list)
    last_update: float = 0.0
    running: bool = True
    error: Optional[str] = None


camera_states: dict[str, CameraState] = {}
camera_lock = threading.Lock()


def run_inference(frame):
    """Single-pass inference with last.pt (Person, Helmet, NoHelmet, Vest,
    NoVest all trained together — no crop/ROI step). Each Person box is
    reduced to a single Conforme / Non Conforme verdict based on whether a
    Helmet and Vest were matched to it. Returns a list of boxes in
    PERCENTAGE coordinates (0-100), one box per detected person:
        {x, y, w, h, label, conf, kind}
    """
    h, w = frame.shape[:2]
    results = person_model.predict(frame, verbose=False, conf=CONFIDENCE_THRESHOLD)[0]

    persons = []
    ppe_items = []  # (label, xyxy, conf)

    for box in results.boxes:
        cls_name = person_model.names[int(box.cls[0])].lower()
        mapped = PPE_CLASS_MAP.get(cls_name, cls_name)
        xyxy = box.xyxy[0].tolist()
        conf = float(box.conf[0])

        if mapped == "Person":
            persons.append({"xyxy": xyxy, "conf": conf})
        else:
            ppe_items.append((mapped, xyxy, conf))

    output_boxes = []

    for p in persons:
        x1, y1, x2, y2 = p["xyxy"]

        has_helmet = False
        has_vest = False
        matched_confs = []

        for label, item_xyxy, item_conf in ppe_items:
            if not box_center_inside(item_xyxy, p["xyxy"], tolerance=MATCH_TOLERANCE):
                continue
            if label == "Helmet":
                has_helmet = True
                matched_confs.append(item_conf)
            elif label == "Vest":
                has_vest = True
                matched_confs.append(item_conf)
            # "No Helmet" / "No Vest" detections are ignored — absence of a
            # positive "Helmet"/"Vest" match is what drives the verdict.

        is_compliant = has_helmet and has_vest
        display_conf = (sum(matched_confs) / len(matched_confs)) if matched_confs else p["conf"]

        output_boxes.append({
            "x": round(x1 / w * 100, 1),
            "y": round(y1 / h * 100, 1),
            "w": round((x2 - x1) / w * 100, 1),
            "h": round((y2 - y1) / h * 100, 1),
            "label": "Conforme" if is_compliant else "Non Conforme",
            "conf": round(display_conf * 100, 1),
            "kind": "ok" if is_compliant else "violation",
        })

    return output_boxes


def camera_worker(camera_id: str, source: str):
    """Continuously reads frames from `source` and refreshes the cached
    detections for `camera_id`. Loops recorded clips to simulate a live
    feed; for an rtsp:// source it just keeps reading until the stream
    drops."""
    is_file = not source.startswith("rtsp://")
    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        with camera_lock:
            camera_states[camera_id].error = f"Could not open source: {source}"
        return

    while camera_states[camera_id].running:
        ok, frame = cap.read()
        if not ok:
            if is_file:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # loop the clip like a live feed
                continue
            with camera_lock:
                camera_states[camera_id].error = "Stream ended"
            break

        try:
            boxes = run_inference(frame)
        except Exception as exc:  # keep the worker alive on a bad frame
            with camera_lock:
                camera_states[camera_id].error = str(exc)
            continue

        compliant = sum(1 for b in boxes if b["kind"] == "ok")

        with camera_lock:
            state = camera_states[camera_id]
            state.workers = len(boxes)
            state.compliant = compliant
            state.boxes = boxes
            state.last_update = time.time()
            state.error = None

        # Pace inference roughly to real playback speed — tune for your GPU.
        time.sleep(0.15)

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
            "boxes": state.boxes,
            "stale": (time.time() - state.last_update) > 5 if state.last_update else True,
            "error": state.error,
        })


@app.route("/api/upload", methods=["POST"])
def upload_clip():
    """Lets the frontend's "Run model on my clip" button run real
    inference on an uploaded video instead of just previewing it."""
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