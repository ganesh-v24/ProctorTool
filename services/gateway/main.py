"""Gateway / Session Service entry point.
Provides:
- Session creation, termination
- Authentication via session cookies
- In‑memory event persistence (placeholder for future DB)
- Forwarding of instrumentation payloads to ML inference service
"""

from fastapi import FastAPI, Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any
import uuid, datetime

app = FastAPI(title="ProctorTool Gateway")

# CORS & security headers (mandatory-secure-web-skills)
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Simple in‑memory store – replace with DB models after future dependency scan
sessions: Dict[str, Dict[str, Any]] = {}

class StartSessionRequest(BaseModel):
    userName: str
    userEmail: str
    deviceInfo: str
    quizCode: str

class StartSessionResponse(BaseModel):
    sessionId: str
    trustScore: int = 100
    counters: Dict[str, int] = {}
    events: List[dict] = []
    startedAt: str

@app.post("/api/session/start", response_model=StartSessionResponse)
async def start_session(req: StartSessionRequest, response: Response):
    sid = str(uuid.uuid4())
    sessions[sid] = {
        "userName": req.userName,
        "userEmail": req.userEmail,
        "deviceInfo": req.deviceInfo,
        "quizCode": req.quizCode,
        "startedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "riskScore": 100,
        "counters": {},
        "events": []
    }
    # Set a simple session cookie (placeholder, not signed)
    response.set_cookie(key="session_id", value=sid, httponly=True, samesite="lax", secure=False)
    return StartSessionResponse(
        sessionId=sid,
        trustScore=100,
        counters={},
        events=[],
        startedAt=sessions[sid]["startedAt"]
    )

def get_current_session(request: Request) -> dict:
    sid = request.cookies.get("session_id")
    if not sid or sid not in sessions:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return sessions[sid]

class EventPayload(BaseModel):
    type: str
    data: dict
    timestamp: str

@app.post("/api/session/{session_id}/event")
async def post_event(session_id: str, payload: EventPayload, request: Request):
    # Simple auth check – ensure cookie matches path param
    if request.cookies.get("session_id") != session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session mismatch")
    sess = sessions.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    sess["events"].append(payload.dict())
    # Update simple counters (example)
    sess["counters"][payload.type] = sess["counters"].get(payload.type, 0) + 1
    return JSONResponse(content={"status": "event recorded"})

@app.get("/health")
async def health():
    return JSONResponse(content={"status": "ok"})
