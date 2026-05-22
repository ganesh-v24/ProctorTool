# ProctorTool

ProctorTool is a modern, lightweight, and extensible automated proctoring platform. It combines a highly optimized Python-based Machine Learning service for real-time computer vision analysis with a responsive, high-fidelity React dashboard.

The system is designed to track candidate behavior during online assessments. It generates real-time violations, captures screenshot evidence, and maintains a dynamic "Trust Score" without requiring complex database setups.

---

## 🏗 Architecture

The platform is split into two primary components:

### 1. ML Service (Backend)
A Python FastAPI server that exposes endpoints for computer vision analysis and session management.
*   **Computer Vision:** Uses OpenCV and ONNX models (`YuNet` for face detection, `Haar Cascades` for body detection, and `YOLO11` for object detection like cell phones and external monitors).
*   **Session State:** Maintains an in-memory session store to aggregate violations, update trust scores, and hold evidence thumbnails. This allows the API to be consumed by external applications (like a browser extension or Frappe backend).

### 2. Live Dashboard (Frontend)
A modern Vite + React application providing a live exam room simulation and a premium dashboard view.
*   **Live Webcam Feed:** Renders native `<video>` feeds overlayed with color-coded bounding boxes mapped from the ML API responses.
*   **Proctoring Metrics:** Displays a dynamic Trust Score gauge, violation counters, and an event log table.
*   **Browser APIs:** Hooks into HTML5 APIs for Tab Focus tracking (`visibilitychange`) and Microphone Noise monitoring (`Web Audio API`).

---

## ✨ Key Features

*   **Real-time Head & Object Tracking:** Detects multiple faces, missing faces, looking away, and suspicious objects (phones, laptops, TVs).
*   **Tab Switching Detection:** Logs a violation immediately if the candidate navigates to a different browser tab or minimizes the window.
*   **Noise Detection:** Monitors ambient audio levels to detect unauthorized communication or excessive background noise.
*   **Dynamic Trust Score:** Starts at 100% and dynamically subtracts points based on violation severity (e.g., -25 for phone detection, -10 for tab switching).
*   **Evidence Capture:** Base64 image frames are automatically captured at the exact moment of a violation and attached to the event log.
*   **Exportable Reports:** One-click CSV export of all session violations.

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   Python (3.10+)
*   `venv` module

### Running the Stack
You can start both the ML service and the React dashboard simultaneously using the provided bash scripts.

1.  **Start Services:**
    ```bash
    ./start.sh
    ```
    *   The ML API will bind to `http://0.0.0.0:8000`.
    *   The React Dashboard will bind to `http://0.0.0.0:3000`.

2.  **View Logs:**
    *   Backend: `tail -f logs/ml-service.log`
    *   Frontend: `tail -f logs/frontend.log`

3.  **Stop Services:**
    ```bash
    ./stop.sh
    ```

---

## 🔌 API Reference

The ML Service provides a comprehensive REST API for initiating sessions and logging alerts. This API can be consumed from anywhere.

### `POST /api/session/start`
Initializes a new proctoring session.
**Payload:**
```json
{
  "userName": "John Flores",
  "userEmail": "john.flores@example.org",
  "deviceInfo": "Desktop, Chrome",
  "quizCode": "QUIZ-101"
}
```
**Response:** Returns a Session Object with a generated `sessionId`.

### `POST /api/session/{sessionId}/alert`
Logs a proctoring violation and recalculates the session's trust score.
**Payload:**
```json
{
  "violationType": "TAB_SWITCHED",
  "message": "Switched to different application/tab",
  "evidence": "data:image/jpeg;base64,/9j/4AAQSk..." 
}
```
*Note: `evidence` is an optional base64 image string used to display thumbnails in the dashboard.*

### `GET /api/session/{sessionId}/summary`
Retrieves the complete state of an active session, including all logged events and current metrics.
**Response:**
```json
{
  "sessionId": "abc-123",
  "trustScore": 65,
  "counters": {
    "tabSwitched": 2,
    "noFace": 2,
    "multipleFaces": 1,
    "noise": 1,
    "multipleMonitors": "No"
  },
  "events": [
    {
      "violationType": "Switched to different application/tab",
      "occurredAt": "01:13:01 PM",
      "evidence": "...",
      "type": "tab_switched"
    }
  ]
}
```

### `POST /analyze`
Analyzes a single image frame for faces, bodies, and objects.
**Payload:**
```json
{
  "image": "data:image/jpeg;base64,..."
}
```
**Response:** Returns a JSON object containing bounding box coordinates (`faceBox`, `bodyBox`, `detectedObjects`), counts, and booleans for conditions like `lookingAway`.

---

## 📂 Project Structure

```text
ProctorTool/
├── ml-service/
│   ├── proctor_ml/
│   │   ├── main.py          # FastAPI application & Session API
│   │   ├── analyzer.py      # Core OpenCV/ONNX inference logic
│   │   └── models/          # Downloaded ML weights (YuNet, YOLO)
│   ├── setup.py             # Pip installable package configuration
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Primary React Dashboard logic
│   │   ├── index.css        # Custom Glassmorphism UI tokens
│   │   └── main.jsx
│   ├── index.html           # HTML Template & Google Fonts
│   └── vite.config.js       # Vite configuration (Port 3000 mapping)
├── logs/                    # Runtime logs output dir
├── start.sh                 # Stack boot script
└── stop.sh                  # Stack teardown script
```
