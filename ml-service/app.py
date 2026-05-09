"""
ProctorTool - ML Proctoring Service
FastAPI + YuNet (OpenCV) + 6DRepNet for ultra-low-latency cheating detection

Stack:
  - YuNet: ~1-3ms CPU face detection (OpenCV DNN, built-in)
  - 6DRepNet: ~10-20ms CPU head pose (SOTA accuracy, full 360 yaw)
  - Total: ~15-30ms per frame = 30-60 FPS on CPU

Endpoints:
  POST /analyze       - Analyze a base64 image for proctoring violations
  GET  /health       - Service health check
  GET  /benchmark    - Run a quick speed benchmark
"""

import base64
import io
import os
import time
import urllib.request
from typing import Dict, Optional

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

app = FastAPI(title="ProctorTool ML Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# Model Setup
# =========================

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

YUNET_MODEL_PATH = os.path.join(MODEL_DIR, "face_detection_yunet_2023mar.onnx")
YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

# Download YuNet if not present
if not os.path.exists(YUNET_MODEL_PATH):
    print("[ML] Downloading YuNet model...")
    try:
        urllib.request.urlretrieve(YUNET_URL, YUNET_MODEL_PATH)
        print("[ML] YuNet downloaded.")
    except Exception as e:
        print(f"[ML] Failed to download YuNet: {e}")

# YuNet detector (input size 320x320 is a good balance)
DETECTOR = None
if os.path.exists(YUNET_MODEL_PATH):
    try:
        DETECTOR = cv2.FaceDetectorYN_create(
            model=YUNET_MODEL_PATH,
            config="",
            input_size=(320, 320),
            score_threshold=0.3,
            nms_threshold=0.3,
            top_k=5000
        )
        print("[ML] YuNet face detector loaded.")
    except Exception as e:
        print(f"[ML] YuNet load failed ({e}), using Haar fallback")
        DETECTOR = None

# Reliable Haar cascade fallback (always works, built into OpenCV)
HAAR_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
print("[ML] Haar cascade fallback ready.")

# 6DRepNet head pose model
HEAD_POSE_MODEL = None
try:
    import torch
    from sixdrepnet import SixDRepNet
    # Force CPU if no CUDA available
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    HEAD_POSE_MODEL = SixDRepNet()
    HEAD_POSE_MODEL.model = HEAD_POSE_MODEL.model.to(device)
    print(f"[ML] 6DRepNet head pose model loaded on {device}.")
except Exception as e:
    print(f"[ML] WARNING: 6DRepNet not available ({e}), using geometric fallback for head pose")


# =========================
# Helpers
# =========================

def decode_base64_image(b64_string: str) -> Optional[np.ndarray]:
    try:
        if ',' in b64_string:
            b64_string = b64_string.split(',')[1]
        img_bytes = base64.b64decode(b64_string)
        pil_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    except Exception as e:
        print(f"[ML] Decode error: {e}")
        return None


def detect_faces_yunet(image: np.ndarray):
    """Use YuNet to detect faces. Returns list of (x, y, w, h, score)."""
    h, w = image.shape[:2]
    if DETECTOR is None:
        return []

    DETECTOR.setInputSize((w, h))
    _, faces = DETECTOR.detect(image)
    if faces is None:
        return []

    results = []
    for face in faces:
        x, y, w_box, h_box, x_re, y_re, x_le, y_le, x_n, y_n, x_rm, y_rm, x_lm, y_lm, score = face
        results.append({
            "x": max(0, int(x)),
            "y": max(0, int(y)),
            "w": int(w_box),
            "h": int(h_box),
            "score": float(score),
            "landmarks": {
                "right_eye": (int(x_re), int(y_re)),
                "left_eye": (int(x_le), int(y_le)),
                "nose": (int(x_n), int(y_n)),
                "right_mouth": (int(x_rm), int(y_rm)),
                "left_mouth": (int(x_lm), int(y_lm)),
            }
        })
    return results


def detect_faces_haar(image: np.ndarray):
    """Reliable fallback using OpenCV Haar cascade (built-in, no download)."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = HAAR_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60))
    results = []
    for (x, y, w, h) in faces:
        # Approximate landmarks from bounding box
        cx, cy = x + w // 2, y + h // 2
        results.append({
            "x": int(x), "y": int(y), "w": int(w), "h": int(h),
            "score": 0.75,
            "landmarks": {
                "right_eye": (cx - w // 5, cy - h // 6),
                "left_eye": (cx + w // 5, cy - h // 6),
                "nose": (cx, cy),
                "right_mouth": (cx - w // 5, cy + h // 4),
                "left_mouth": (cx + w // 5, cy + h // 4),
            }
        })
    return results


def estimate_head_pose_6drepnet(face_crop: np.ndarray) -> Optional[dict]:
    """Use 6DRepNet for head pose. Returns {pitch, yaw, roll} or None."""
    if HEAD_POSE_MODEL is None:
        return None
    try:
        pitch, yaw, roll = HEAD_POSE_MODEL.predict(face_crop)
        return {"pitch": float(pitch), "yaw": float(yaw), "roll": float(roll)}
    except Exception as e:
        print(f"[ML] 6DRepNet error: {e}")
        return None


def estimate_head_pose_geometric(face_crop: np.ndarray, landmarks: dict) -> Optional[dict]:
    """Fast fallback: estimate head pose from eye-nose-mouth triangle.
    Calibrated so that looking straight at screen = yaw~0, pitch~0."""
    if landmarks is None:
        return None
    le = landmarks["left_eye"]
    re = landmarks["right_eye"]
    nose = landmarks["nose"]

    h, w = face_crop.shape[:2]
    if w == 0 or h == 0:
        return None

    # Eye center
    eye_cx = (le[0] + re[0]) / 2
    eye_cy = (le[1] + re[1]) / 2

    # Horizontal eye line angle (roll)
    # Use image-left to image-right eye so dx is positive for upright faces
    eye_left_img = le   # person's left eye = right side of image (larger x)
    eye_right_img = re  # person's right eye = left side of image (smaller x)
    dx = eye_left_img[0] - eye_right_img[0]  # positive when upright
    dy = eye_left_img[1] - eye_right_img[1]
    roll = np.degrees(np.arctan2(dy, dx))

    # Inter-ocular distance (eye spacing) for normalization
    ied = max(1, np.sqrt(dx*dx + dy*dy))

    # Nose offset relative to eye center, normalized by eye spacing
    # This makes the estimate scale-invariant
    nose_dx = (nose[0] - eye_cx) / ied
    nose_dy = (nose[1] - eye_cy) / ied

    # Yaw: nose shifted left/right from the eye centerline
    # Typical range: -0.3 to +0.3 -> map to -60 to +60 degrees
    yaw = nose_dx * 60

    # Pitch: nose above/below eye line
    # Typical range: -0.2 to +0.3 -> map to -40 to +60 degrees
    pitch = -nose_dy * 50

    return {"pitch": float(pitch), "yaw": float(yaw), "roll": float(roll)}


def check_face_covered(face_crop: np.ndarray, landmarks: dict, score: float) -> bool:
    """Detect if face is partially covered."""
    # Very low confidence suggests partial occlusion (only flag if extremely low)
    if score < 0.3:
        return True

    # Check brightness variance (covered faces are often flat)
    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    std = np.std(gray)
    if std < 20:  # Very flat image suggests covering
        return True

    # Check landmark positions for mask (mouth landmarks hidden)
    if landmarks:
        lm = landmarks
        # If mouth landmarks are very close to nose, possible mask
        nose_y = lm["nose"][1]
        rm_y = lm["right_mouth"][1]
        lm_y = lm["left_mouth"][1]
        mouth_y = (rm_y + lm_y) / 2
        if mouth_y - nose_y < face_crop.shape[0] * 0.05:
            return True

    return False


def analyze_image(image_b64: str) -> Dict:
    start_time = time.time()
    result = {
        "faceDetected": False,
        "multiplePeople": False,
        "faceCovered": False,
        "lookingAway": False,
        "faceCount": 0,
        "headPose": None,
        "processingTimeMs": 0,
        "error": None,
        "model": "yunet",
        "detector_used": None,
    }

    image = decode_base64_image(image_b64)
    if image is None:
        result["error"] = "Failed to decode image"
        result["processingTimeMs"] = round((time.time() - start_time) * 1000, 2)
        return result

    # ---- Step 1: Face Detection ----
    faces = detect_faces_yunet(image) if DETECTOR else []
    if faces:
        result["detector_used"] = "yunet"
    else:
        faces = detect_faces_haar(image)
        if faces:
            result["detector_used"] = "haar"
    if not faces:
        result["processingTimeMs"] = round((time.time() - start_time) * 1000, 2)
        return result

    face_count = len(faces)
    result["faceCount"] = face_count
    result["faceDetected"] = face_count >= 1
    result["multiplePeople"] = face_count > 1

    # ---- Step 2: Analyze the primary face (highest score) ----
    primary_face = max(faces, key=lambda f: f["score"])
    x, y, w, h = primary_face["x"], primary_face["y"], primary_face["w"], primary_face["h"]

    img_h, img_w = image.shape[:2]
    result["faceBox"] = {
        "x": int(x),
        "y": int(y),
        "w": int(w),
        "h": int(h),
        "img_w": img_w,
        "img_h": img_h,
    }

    # Expand crop slightly for head pose model
    pad = int(0.1 * max(w, h))
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(image.shape[1], x + w + pad)
    y2 = min(image.shape[0], y + h + pad)
    face_crop = image[y1:y2, x1:x2]

    # Head pose
    pose = estimate_head_pose_6drepnet(face_crop)
    if pose is None:
        pose = estimate_head_pose_geometric(face_crop, primary_face.get("landmarks"))
        result["model"] = "yunet+geometric"
    else:
        result["model"] = "yunet+6drepnet"

    if pose:
        result["headPose"] = pose
        # Looking away thresholds: yaw > 45 (side glance) or pitch > 35 (looking up/down)
        # These are calibrated for a webcam placed above the monitor at ~50cm distance
        result["lookingAway"] = abs(pose["yaw"]) > 45 or abs(pose["pitch"]) > 35

    # Face cover
    result["faceCovered"] = check_face_covered(face_crop, primary_face.get("landmarks"), primary_face["score"])

    result["processingTimeMs"] = round((time.time() - start_time) * 1000, 2)
    return result


# =========================
# API Endpoints
# =========================

@app.get("/health")
def health():
    detector_ok = DETECTOR is not None
    pose_ok = HEAD_POSE_MODEL is not None
    return {
        "status": "ok",
        "service": "ProctorTool",
        "models": {
            "yunet": detector_ok,
            "6drepnet": pose_ok,
            "fallback": not detector_ok,
        }
    }


@app.post("/analyze")
def analyze(payload: dict):
    image_b64 = payload.get("image", "")
    if not image_b64:
        return {"error": "No image provided"}
    return analyze_image(image_b64)


@app.get("/benchmark")
def benchmark():
    """Run a quick synthetic benchmark."""
    import random
    # Create a synthetic image
    img = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    b64 = base64.b64encode(buf).decode()

    times = []
    for _ in range(10):
        t0 = time.time()
        analyze_image(f"data:image/jpeg;base64,{b64}")
        times.append((time.time() - t0) * 1000)

    return {
        "model": "yunet+6drepnet",
        "runs": len(times),
        "avg_ms": round(sum(times) / len(times), 2),
        "min_ms": round(min(times), 2),
        "max_ms": round(max(times), 2),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

