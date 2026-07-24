import cv2
from ultralytics import YOLO

# Load the trained model
model = YOLO("models/best.pt")

# Replace with your IP camera URL
camera_url = "http://YOUR_CAMERA_IP:PORT/video"

cap = cv2.VideoCapture(camera_url)

if not cap.isOpened():
    print("Cannot connect to the camera")
    exit()

while True:
    success, frame = cap.read()

    if not success:
        break

    # Run YOLO
    results = model.predict(
        frame,
        conf=0.35,
        verbose=False
    )

    # Draw detections
    annotated_frame = results[0].plot()

    cv2.imshow("PPE Detection", annotated_frame)

    if cv2.waitKey(1) == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()