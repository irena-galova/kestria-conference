"""Re-crop Ayesha Khanna's headshot with the face higher in the frame."""
from pathlib import Path
import cv2
from PIL import Image

SRC = Path("Singapore data/speakers/Ayesha Khanna headshot.jpeg")
DST = Path("site/img/speakers/ayesha-khanna.jpg")
SIZE = 600

def main():
    img = cv2.imread(str(SRC))
    if img is None:
        raise SystemExit(f"Could not open {SRC}")
    h, w = img.shape[:2]

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))

    if len(faces) == 0:
        raise SystemExit("No face detected")

    # Pick the largest face
    fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    face_cx = fx + fw // 2
    face_cy = fy + fh // 2

    side = int(max(fw, fh) * 3.0)
    side = min(side, min(w, h))

    # Shift crop center UP so the face sits in the upper third.
    # This means the crop box's center-y is BELOW the face center.
    upward_shift = int(fh * 0.55)  # face moves up in the frame
    cy = face_cy + upward_shift

    x0 = max(0, min(w - side, face_cx - side // 2))
    y0 = max(0, min(h - side, cy - side // 2))

    crop = img[y0:y0 + side, x0:x0 + side]
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb).resize((SIZE, SIZE), Image.LANCZOS)
    DST.parent.mkdir(parents=True, exist_ok=True)
    pil.save(DST, "JPEG", quality=88, optimize=True)
    print(f"Wrote {DST} ({DST.stat().st_size} bytes)")
    print(f"Face box: x={fx} y={fy} w={fw} h={fh}")
    print(f"Crop box: x={x0} y={y0} side={side}")

if __name__ == "__main__":
    main()
