# -*- coding: utf-8 -*-
"""ProctorTool ML Service packaged as a pip installable module.
"""

import base64
import io
import os
import time
import urllib.request
from typing import Dict, Optional, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

try:
    import webrtcvad
    VAD = webrtcvad.Vad(2)  # Aggressiveness mode 2
except Exception as e:
    print(f"[ML] WARNING: webrtcvad not available ({e})")
    VAD = None

app = FastAPI(title="ProctorTool ML Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------- Model Setup --------------------
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

# Reliable Haar cascades for body detection
UPPERBODY_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_upperbody.xml")
FULLBODY_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_fullbody.xml")
print("[ML] Haar body cascades ready.")

# 6DRepNet head pose model
HEAD_POSE_MODEL = None
try:
    import torch
    from sixdrepnet import SixDRepNet
    # Force CPU if no CUDA available
    gpu_id = 0 if torch.cuda.is_available() else -1
    HEAD_POSE_MODEL = SixDRepNet(gpu_id=gpu_id)
    print(f"[ML] 6DRepNet head pose model loaded on {'cuda' if gpu_id >= 0 else 'cpu'}.")
except Exception as e:
    print(f"[ML] WARNING: 6DRepNet not available ({e}), using geometric fallback for head pose")

# YOLO object detection model (pretrained on COCO)
YOLO_MODEL = None
try:
    from ultralytics import YOLO
    YOLO_MODEL_PATH = os.path.join(MODEL_DIR, "yolo11m.pt")
    YOLO_MODEL = YOLO(YOLO_MODEL_PATH)
    print(f"[ML] YOLO11m model loaded from {YOLO_MODEL_PATH}.")
except Exception as e:
    print(f"[ML] WARNING: YOLO not available ({e})")

# -------------------- Helpers --------------------

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

def detect_multi_speaker(audio_bytes: bytes) -> Tuple[bool, float]:
    """Detect speech and multi-speaker overlap in PCM 16-bit mono 16kHz audio.
    Heuristic: Continuous speech without micro-pauses for > 1.5 seconds.
    """
    if VAD is None:
        return False, 0.0

    # 16kHz 16-bit mono = 32000 bytes/sec. 30ms frame = 960 bytes.
    frame_len = 960
    speech_frames = 0
    total_frames = 0
    
    max_contiguous_speech = 0
    current_contiguous_speech = 0
    
    # Iterate through 30ms frames
    for i in range(0, len(audio_bytes) - frame_len + 1, frame_len):
        frame = audio_bytes[i:i+frame_len]
        total_frames += 1
        try:
            is_speech = VAD.is_speech(frame, 16000)
        except Exception:
            is_speech = False
            
        if is_speech:
            speech_frames += 1
            current_contiguous_speech += 1
            if current_contiguous_speech > max_contiguous_speech:
                max_contiguous_speech = current_contiguous_speech
        else:
            current_contiguous_speech = 0

    if total_frames == 0:
        return False, 0.0
        
    confidence = speech_frames / total_frames
    
    # 1.5 seconds threshold = 1500 ms / 30 ms = 50 frames
    multi_speaker = max_contiguous_speech >= 50
    
    return multi_speaker, float(confidence)

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

def detect_bodies(image: np.ndarray):
    """Detect human bodies (upper body and full body). Returns list of dicts."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    upper_bodies = UPPERBODY_CASCADE.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=2, minSize=(50, 50))
    full_bodies = FULLBODY_CASCADE.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=2, minSize=(50, 50))
    
    results = []
    for (x, y, w, h) in upper_bodies:
        results.append({
            "type": "upper_body",
            "x": int(x),
            "y": int(y),
            "w": int(w),
            "h": int(h)
        })
    for (x, y, w, h) in full_bodies:
        results.append({
            "type": "full_body",
            "x": int(x),
            "y": int(y),
            "w": int(w),
            "h": int(h)
        })
    return results

def detect_objects(image: np.ndarray):
    """Detect suspicious objects (cell phone, laptop, book, tv) using YOLO. Returns list of dicts."""
    if YOLO_MODEL is None:
        return []
    
    try:
        results = YOLO_MODEL(image, verbose=False)
    except Exception as e:
        print(f"[ML] YOLO inference error: {e}")
        return []
        
    detected = []
    SUSPICIOUS_CLASSES = {"cell phone", "laptop", "book", "tv"}
    
    for result in results:
        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            label = YOLO_MODEL.names[cls_id]
            conf = float(box.conf[0].item())
            if label in SUSPICIOUS_CLASSES and conf > 0.4:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                detected.append({
                    "label": label,
                    "confidence": round(conf, 2),
                    "x": int(x1),
                    "y": int(y1),
                    "w": int(x2 - x1),
                    "h": int(y2 - y1)
                })
    return detected

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
    """Fast fallback: estimate head pose from eye-nose-mouth triangle."""
    if landmarks is None:
        return None
    le = landmarks["left_eye"]
    re = landmarks["right_eye"]
    nose = landmarks["nose"]

    h, w = face_crop.shape[:2]
    if w == 0 or h == 0:
        return None

    eye_cx = (le[0] + re[0]) / 2
    eye_cy = (le[1] + re[1]) / 2

    eye_left_img = le
    eye_right_img = re
    dx = eye_left_img[0] - eye_right_img[0]
    dy = eye_left_img[1] - eye_right_img[1]
    roll = np.degrees(np.arctan2(dy, dx))

    ied = max(1, np.sqrt(dx*dx + dy*dy))

    nose_dx = (nose[0] - eye_cx) / ied
    nose_dy = (nose[1] - eye_cy) / ied

    yaw = nose_dx * 60
    pitch = -nose_dy * 50

    return {"pitch": float(pitch), "yaw": float(yaw), "roll": float(roll)}

def check_face_covered(face_crop: np.ndarray, landmarks: dict, score: float) -> bool:
    """Detect if face is partially covered."""
    if score < 0.3:
        return True

    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    std = np.std(gray)
    if std < 20:
        return True

    if landmarks:
        lm = landmarks
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
        "bodyDetected": False,
        "bodyCount": 0,
        "bodyBox": None,
        "body_detector": "none",
        "multipleFaces": False,
        "multipleBodies": False,
        "detectedObjects": [],
        "phoneDetected": False,
        "secondaryDeviceDetected": False,
        "bookDetected": False,
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

    face_count = len(faces)
    result["faceCount"] = face_count
    result["faceDetected"] = face_count >= 1
    result["multipleFaces"] = face_count > 1

    # ---- Step 2: Body Detection ----
    bodies = detect_bodies(image)
    body_count = len(bodies)
    result["bodyCount"] = body_count
    result["multipleBodies"] = body_count > 1
    result["multiplePeople"] = (face_count > 1) or (body_count > 1)
    result["bodyDetected"] = (body_count >= 1) or (face_count >= 1)

    if bodies:
        primary_body = max(bodies, key=lambda b: b["w"] * b["h"])
        img_h, img_w = image.shape[:2]
        result["bodyBox"] = {
            "x": primary_body["x"],
            "y": primary_body["y"],
            "w": primary_body["w"],
            "h": primary_body["h"],
            "type": primary_body["type"],
            "img_w": img_w,
            "img_h": img_h,
        }
        result["body_detector"] = "cascade"
    elif faces:
        primary_face = max(faces, key=lambda f: f["score"])
        fx, fy, fw, fh = primary_face["x"], primary_face["y"], primary_face["w"], primary_face["h"]
        
        img_h, img_w = image.shape[:2]
        bx = int(max(0, fx - fw))
        by = int(min(img_h - 1, fy + fh * 0.8))
        bw = int(min(img_w - bx, fw * 3.5))
        bh = int(min(img_h - by, fh * 4.5))

        result["bodyBox"] = {
            "x": bx,
            "y": by,
            "w": bw,
            "h": bh,
            "type": "inferred_body",
            "img_w": img_w,
            "img_h": img_h,
        }
        result["body_detector"] = "inferred"

    # ---- Step 3: Suspicious Object Detection (YOLO) ----
    detected_objects = detect_objects(image)
    result["detectedObjects"] = detected_objects
    result["phoneDetected"] = any(obj["label"] == "cell phone" for obj in detected_objects)
    result["secondaryDeviceDetected"] = any(obj["label"] in {"laptop", "tv"} for obj in detected_objects)
    result["bookDetected"] = any(obj["label"] == "book" for obj in detected_objects)

    if not faces and not bodies and not detected_objects:
        result["processingTimeMs"] = round((time.time() - start_time) * 1000, 2)
        return result

    # ---- Step 4: Analyze the primary face (highest score) ----
    if faces:
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

        pad = int(0.1 * max(w, h))
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(image.shape[1], x + w + pad)
        y2 = min(image.shape[0], y + h + pad)
        face_crop = image[y1:y2, x1:x2]

        pose = estimate_head_pose_6drepnet(face_crop)
        if pose is None:
            pose = estimate_head_pose_geometric(face_crop, primary_face.get("landmarks"))
            result["model"] = "yunet+geometric"
        else:
            result["model"] = "yunet+6drepnet"

        if pose:
            result["headPose"] = pose
            result["lookingAway"] = abs(pose["yaw"]) > 45 or abs(pose["pitch"]) > 35

        result["faceCovered"] = check_face_covered(face_crop, primary_face.get("landmarks"), primary_face["score"])

    result["processingTimeMs"] = round((time.time() - start_time) * 1000, 2)
    return result

# -------------------- API Endpoints --------------------

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

@app.post("/ingest")
async def ingest(request: Request):
    """Receive a raw binary image (e.g., JPEG) from the gateway.
    The body is expected to be the raw image bytes.
    Returns the same JSON structure as `analyze_image`.
    """
    try:
        data = await request.body()
        if not data:
            raise HTTPException(status_code=400, detail="Empty payload")
        # Encode to base64 data URL for reuse of existing logic
        b64 = base64.b64encode(data).decode()
        data_url = f"data:image/jpeg;base64,{b64}"
        return analyze_image(data_url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.get("/benchmark")
def benchmark():
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

import uuid
from pydantic import BaseModel

# In-memory session store
SESSIONS: Dict[str, dict] = {}

class SessionStartPayload(BaseModel):
    userName: str
    userEmail: str
    deviceInfo: Optional[str] = "Desktop, Chrome"
    quizCode: str

class AlertPayload(BaseModel):
    violationType: str  # e.g., "TAB_SWITCHED", "NO_FACE", "MULTIPLE_FACES", "NOISE", "OBJECT_DETECTED"
    message: str
    evidence: Optional[str] = None # Base64 image string or None

@app.post("/api/session/start")
def start_session(payload: SessionStartPayload):
    session_id = str(uuid.uuid4())
    started_at = time.strftime("%d-%b %I:%M %p")
    SESSIONS[session_id] = {
        "sessionId": session_id,
        "userName": payload.userName,
        "userEmail": payload.userEmail,
        "deviceInfo": payload.deviceInfo,
        "quizCode": payload.quizCode,
        "startedAt": started_at,
        "submittedAt": None,
        "trustScore": 100,
        "counters": {
            "tabSwitched": 0,
            "noFace": 0,
            "multipleFaces": 0,
            "noise": 0,
            "multipleMonitors": "No"
        },
        "events": []
    }
    return SESSIONS[session_id]

@app.post("/api/session/{session_id}/alert")
def add_alert(session_id: str, payload: AlertPayload):
    if session_id not in SESSIONS:
        return {"error": "Session not found"}
    
    session = SESSIONS[session_id]
    
    # Increment counters
    v_type = payload.violationType
    deduction = 0
    if v_type == "TAB_SWITCHED":
        session["counters"]["tabSwitched"] += 1
        deduction = 10
    elif v_type == "NO_FACE":
        session["counters"]["noFace"] += 1
        deduction = 15
    elif v_type == "MULTIPLE_FACES":
        session["counters"]["multipleFaces"] += 1
        deduction = 20
    elif v_type == "NOISE":
        session["counters"]["noise"] += 1
        deduction = 5
    elif v_type == "OBJECT_DETECTED":
        # Handle phone or other devices
        if "phone" in payload.message.lower():
            deduction = 25
        elif any(x in payload.message.lower() for x in ["monitor", "screen", "laptop", "tv"]):
            deduction = 15
            session["counters"]["multipleMonitors"] = "Yes"
        else:
            deduction = 10
    elif v_type == "MULTIPLE_MONITORS":
        session["counters"]["multipleMonitors"] = "Yes"
        deduction = 15
    elif v_type == "AUDIO_VAD":
        session["counters"]["noise"] += 1
        deduction = 15
            
    # Update trust score
    session["trustScore"] = max(0, session["trustScore"] - deduction)
    
    # Append event
    event = {
        "violationType": payload.message,
        "occurredAt": time.strftime("%I:%M:%S %p"),
        "evidence": payload.evidence,
        "type": v_type.lower()
    }
    session["events"].append(event)
    return session

@app.post("/api/session/{session_id}/end")
def end_session(session_id: str):
    if session_id not in SESSIONS:
        return {"error": "Session not found"}
    SESSIONS[session_id]["submittedAt"] = time.strftime("%d-%b %I:%M %p")
    return SESSIONS[session_id]

@app.get("/api/session/{session_id}/summary")
def get_session_summary(session_id: str):
    if session_id not in SESSIONS:
        return {"error": "Session not found"}
    return SESSIONS[session_id]

# --- Head Pose and Audio Analyze Endpoints ---

class HeadPoseRequest(BaseModel):
    image_base64: str

class HeadPoseResponse(BaseModel):
    yaw: float
    pitch: float
    roll: float

@app.post("/head-pose", response_model=HeadPoseResponse)
def head_pose(payload: HeadPoseRequest):
    """Return head pose angles (yaw, pitch, roll) for a given image.
    The image must be a base64‑encoded JPEG/PNG. Returns angles in degrees."""
    img = decode_base64_image(payload.image_base64)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image data")
    
    # Detect face using YuNet first, falling back to Haar cascade
    faces = detect_faces_yunet(img) if DETECTOR else []
    if not faces:
        faces = detect_faces_haar(img)
        
    if not faces:
        raise HTTPException(status_code=400, detail="No face detected in video feed")
        
    primary_face = max(faces, key=lambda f: f["score"])
    x, y, w, h = primary_face["x"], primary_face["y"], primary_face["w"], primary_face["h"]
    
    # Pad and crop the face region
    pad = int(0.1 * max(w, h))
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(img.shape[1], x + w + pad)
    y2 = min(img.shape[0], y + h + pad)
    face_crop = img[y1:y2, x1:x2]
    
    pose = estimate_head_pose_6drepnet(face_crop)
    if pose is None:
        pose = estimate_head_pose_geometric(face_crop, primary_face.get("landmarks"))
        
    if pose is None:
        raise HTTPException(status_code=500, detail="Head pose estimation failed")
        
    return HeadPoseResponse(
        yaw=float(pose["yaw"]),
        pitch=float(pose["pitch"]),
        roll=float(pose["roll"])
    )

class AudioAnalyzeRequest(BaseModel):
    audio_base64: str

class AudioAnalyzeResponse(BaseModel):
    multi_speaker: bool
    speech_confidence: float

@app.post("/audio-analyze", response_model=AudioAnalyzeResponse)
def audio_analyze(payload: AudioAnalyzeRequest):
    """Accept base64‑encoded PCM audio and detect multi‑speaker activity.
    Expected payload: {"audio_base64": "..."}
    Returns: {"multi_speaker": bool, "speech_confidence": float}
    """
    audio_b64 = payload.audio_base64
    if not audio_b64:
        raise HTTPException(status_code=400, detail="Missing audio_base64 field")
    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio data")
    
    multi, confidence = detect_multi_speaker(audio_bytes)
    return AudioAnalyzeResponse(multi_speaker=multi, speech_confidence=confidence)

def run():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    run()
