import cv2
import os
from ultralytics import YOLO

# ============================================================
# CONFIGURATION
# ============================================================

PERSON_MODEL = "models/yolov8s.pt"
PPE_MODEL = "models/best_v3.pt"


CAMERA_URL = "rtsp://username:password@192.168.1.100:554/Streaming/Channels/101"

DISPLAY_WIDTH = 1280
DISPLAY_HEIGHT = 720

FRAME_SKIP = 3
INFERENCE_SIZE = 640

DEVICE = "cpu"  # "cuda:0" if you have an NVIDIA GPU

PERSON_CONF = 0.35
PPE_CONF = 0.25

ROI_PAD_TOP_RATIO = 0.35
ROI_PAD_SIDE_RATIO = 0.15
ROI_PAD_BOTTOM_RATIO = 0.05

# ============================================================
# LOAD MODELS
# ============================================================

print("Loading models...")

person_model = YOLO(PERSON_MODEL)
ppe_model = YOLO(PPE_MODEL)

print("Models loaded.")

# ============================================================
# OPEN CAMERA
# ============================================================

cap = cv2.VideoCapture(CAMERA_URL)

if not cap.isOpened():
    raise RuntimeError("Cannot open camera stream.")

frame_count = 0

# ============================================================
# MAIN LOOP
# ============================================================

while True:

    success, frame = cap.read()

    if not success:
        print("Cannot read frame.")
        break

    frame_count += 1

    if frame_count % FRAME_SKIP != 0:
        continue

    annotated = frame.copy()

    # ========================================================
    # STAGE 1: PERSON DETECTION
    # ========================================================

    person_results = person_model.predict(
        frame,
        classes=[0],
        conf=PERSON_CONF,
        imgsz=640,
        device=DEVICE,
        verbose=False
    )

    # ========================================================
    # STAGE 2: PPE DETECTION
    # ========================================================

    for person in person_results[0].boxes:

        x1, y1, x2, y2 = map(int, person.xyxy[0])

        box_w = x2 - x1
        box_h = y2 - y1

        pad_top = int(box_h * ROI_PAD_TOP_RATIO)
        pad_bottom = int(box_h * ROI_PAD_BOTTOM_RATIO)
        pad_side = int(box_w * ROI_PAD_SIDE_RATIO)

        x1 = max(0, x1 - pad_side)
        y1 = max(0, y1 - pad_top)
        x2 = min(frame.shape[1], x2 + pad_side)
        y2 = min(frame.shape[0], y2 + pad_bottom)

        roi = frame[y1:y2, x1:x2]

        if roi.size == 0:
            continue

        ppe_results = ppe_model.predict(
            roi,
            conf=PPE_CONF,
            imgsz=INFERENCE_SIZE,
            device=DEVICE,
            verbose=False
        )

        helmet = False
        vest = False

        for box in ppe_results[0].boxes:

            cls = int(box.cls[0])
            conf = float(box.conf[0])

            label = ppe_model.names[cls]
            normalized = label.lower().replace("-", "")

            px1, py1, px2, py2 = map(int, box.xyxy[0])

            fx1 = x1 + px1
            fy1 = y1 + py1
            fx2 = x1 + px2
            fy2 = y1 + py2

            color = (0, 255, 0)

            if normalized == "helmet":
                helmet = True

            elif normalized == "vest":
                vest = True

            elif normalized in ["nohelmet", "novest"]:
                color = (0, 0, 255)

            cv2.rectangle(
                annotated,
                (fx1, fy1),
                (fx2, fy2),
                color,
                2
            )

            cv2.putText(
                annotated,
                f"{label} {conf:.2f}",
                (fx1, fy1 - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                2
            )

        missing = []

        if not helmet:
            missing.append("Helmet")

        if not vest:
            missing.append("Vest")

        if len(missing) == 0:
            status = "CONFORM"
            person_color = (0, 255, 0)

        else:
            status = "NON-CONFORM: " + " & ".join(missing)
            person_color = (0, 0, 255)

        cv2.rectangle(
            annotated,
            (x1, y1),
            (x2, y2),
            person_color,
            3
        )

        cv2.putText(
            annotated,
            status,
            (x1, y1 - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            person_color,
            2
        )

    # ========================================================
    # DISPLAY
    # ========================================================

    display = cv2.resize(
        annotated,
        (DISPLAY_WIDTH, DISPLAY_HEIGHT)
    )

    cv2.imshow("Real Camera Test", display)

    key = cv2.waitKey(1)

    if key == ord("q"):
        break

# ============================================================
# CLEANUP
# ============================================================

cap.release()
cv2.destroyAllWindows()