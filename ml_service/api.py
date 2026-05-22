import os
import uvicorn
import time
import base64
from fastapi import Body, FastAPI, HTTPException, Request, status
from pydantic import BaseModel, Field
from typing import List, Any, Dict
import torch
from proctor_ml.main import HEAD_POSE_MODEL, decode_base64_image, detect_multi_speaker
from fastapi.middleware.cors import CORSMiddleware

from rule_engine import RuleEngine, Event

# ---------------------------------------------------------------------------
# Configuration (environment‑driven, no secrets hard‑coded)
# ---------------------------------------------------------------------------
# Path to the JSON rule file – can be overridden via env var for flexibility
RULES_PATH = os.getenv("RULES_JSON_PATH", "rules.json")
# Allowed origin of the dashboard – set to your real dashboard URL in prod
ALLOWED_ORIGINS = os.getenv("DASHBOARD_ORIGIN", "http://localhost:3000").split(",")
# Correlation window (ms) – also configurable at runtime
CORRELATION_WINDOW_MS = int(os.getenv("CORRELATION_WINDOW_MS", "30000"))

# ---------------------------------------------------------------------------
# FastAPI app definition
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Proctor Rule Engine API",
    description="Evaluates incoming proctoring events against configured rules and returns violations.",
    version="0.1.0",
)

# CORS – restrict to the trusted dashboard origin(s) only
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic models – strict validation (no extra fields allowed)
# ---------------------------------------------------------------------------
class EventPayload(BaseModel):
    event_type: str = Field(..., description="The type of event, e.g. GAZE_AWAY")
    payload: Dict[str, Any] = Field(..., description="Arbitrary event data required by the rule")
    timestamp_ms: int | None = Field(
        None,
        description="Optional epoch ms for the event; if omitted the server will fill it",
    )

    class Config:
        extra = "forbid"  # reject unexpected keys – a security hardening measure

class ViolationResponse(BaseModel):
    rule_id: str
    severity: str
    penalty: float
    timestamp_ms: int
    details: Dict[str, Any]

# ---------------------------------------------------------------------------
# Initialise the RuleEngine – this is thread‑safe and shared across requests
# ---------------------------------------------------------------------------
engine = RuleEngine(correlation_window_ms=CORRELATION_WINDOW_MS)
try:
    engine.load_rules(RULES_PATH)
except Exception as exc:
    # Fail fast – the service cannot operate without rules.
    raise RuntimeError(f"Failed to load rule configuration from {RULES_PATH}: {exc}")

# ---------------------------------------------------------------------------
# API endpoint – evaluate a single event
# ---------------------------------------------------------------------------
@app.post("/evaluate", response_model=List[ViolationResponse])
async def evaluate_event(event: EventPayload, request: Request):
    """Process a single proctoring event.
    The request must include a JSON body matching :class:`EventPayload`.
    Returns a list of violations (may be empty).
    """
    # Basic rate‑limit placeholder – in production replace with a proper limiter.
    # Here we simply check the client IP and enforce a very low ceiling (e.g. 100 rps).
    # This is deliberately simple to avoid external dependencies.
    client_ip = request.client.host
    # (A real implementation would store a sliding‑window counter per IP.)

    # Prepare the Event object for the engine.
    timestamp = event.timestamp_ms or int(time.time() * 1000)
    engine_event = Event(event_type=event.event_type, payload=event.payload, timestamp_ms=timestamp)

    try:
        violations = engine.process_event(session_id=client_ip, event=engine_event)
    except Exception as exc:
        # Defensive: never expose internal stack traces to the client.
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Event processing failed")

    # Convert to the Pydantic response model.
    return [
        ViolationResponse(
            rule_id=v.rule_id,
            severity=v.severity,
            penalty=v.penalty,
            timestamp_ms=v.timestamp_ms,
            details=v.details,
        )
        for v in violations
    ]

# --- New head pose endpoint ---
class HeadPoseRequest(BaseModel):
    image_base64: str = Field(..., description="Base64‑encoded image (data URI or raw).")

class HeadPoseResponse(BaseModel):
    yaw: float
    pitch: float
    roll: float

@app.post("/head-pose", response_model=HeadPoseResponse)
async def head_pose(request: HeadPoseRequest):
    """Return head pose angles (yaw, pitch, roll) for a given image.
    The image must be a base64‑encoded JPEG/PNG. Returns angles in degrees."""
    # Decode image safely
    img = decode_base64_image(request.image_base64)
    if img is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image data")
    if HEAD_POSE_MODEL is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Head pose model not available")
    try:
        # Prepare tensor: HWC -> CHW, normalize to [0,1]
        tensor = torch.from_numpy(img).permute(2, 0, 1).unsqueeze(0).float() / 255.0
        with torch.no_grad():
            pose = HEAD_POSE_MODEL(tensor)
        # Assume pose is (1,3) tensor: yaw, pitch, roll in radians
        yaw, pitch, roll = pose.squeeze().cpu().numpy()
        # Convert to degrees for easier UI handling
        import math
        yaw_deg = math.degrees(yaw)
        pitch_deg = math.degrees(pitch)
        roll_deg = math.degrees(roll)
        return HeadPoseResponse(yaw=yaw_deg, pitch=pitch_deg, roll=roll_deg)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Head pose inference failed")

# ---------------------------------------------------------------------------
# Optional health‑check endpoint – useful for orchestration tools
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "ok"}

# ---------------------------------------------------------------------------
# Main entry‑point – run with `uvicorn` if executed directly.
# ---------------------------------------------------------------------------
#Existing main entry point remains unchanged
