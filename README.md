# ProctorTool - Modernized Proctoring System

A faster, easier-to-deploy fork of [Aankh](https://github.com/tusharnankani/Aankh) with upgraded ML models, no MongoDB dependency, and real-time WebSocket proctoring.

## What Changed (vs Original)

| Feature | Original | ProctorTool |
|---------|----------|----------|
| Database | MongoDB | In-memory (zero setup) |
| ML Framework | TensorFlow Hub + OpenCV | MediaPipe + FastAPI |
| Face Detection | Custom CNN | MediaPipe Face Detection (GPU/CPU optimized) |
| Head Pose | Custom 68-point solver | MediaPipe Face Mesh (468 landmarks) |
| Latency | High (Flask sync) | Low (FastAPI async) |
| Real-time | HTTP polling | WebSocket (Socket.io) |
| Chrome Ext | MV2, basic tabs | MV3, tabs + devtools + fullscreen + copy/paste block |
| Frontend | Create React App | Vite (fast HMR) |

## Architecture

```
Frontend (React + Vite)  <-->  Backend (Node.js + Socket.io)  <-->  ML Service (FastAPI + MediaPipe)
       |                              |                                |
   Port 3000                    Port 5000                         Port 8000
```

## Quick Start (5 minutes)

### 1. Backend

```bash
cd backend
npm install
npm start
```

Runs on `http://localhost:5000`

### 2. ML Service

Requires Python 3.9+ with `pip`:

```bash
cd ml-service
pip install -r requirements.txt
python app.py
```

Runs on `http://localhost:8000`

**First run** will download MediaPipe models (~50MB).

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:3000`

### 4. Chrome Extension (Optional but Recommended)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder

## Proctoring Features

### ML Analysis (every 3 seconds)
- Face detection & verification
- Multiple people detection
- Face cover / visibility check
- Head pose estimation (looking away detection)
- Low latency: typically 50-150ms per frame

### Browser Integrity
- Tab switch detection
- DevTools detection
- Fullscreen exit detection
- Copy / paste / right-click blocking
- Window blur detection (alt-tab)

### Admin Dashboard
- Live student list with warning counts
- Real-time event feed
- Session summaries

## API Endpoints

### Backend (`:5000`)
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `POST /api/tests` - Create test
- `GET  /api/tests` - List tests
- `GET  /api/tests/code/:code` - Get test by code
- `GET  /api/tests/:id/dashboard` - Test dashboard
- `GET  /api/health` - Health check
- **WebSocket** `/` - Real-time proctoring events

### ML Service (`:8000`)
- `POST /analyze` - Analyze single image
- `POST /analyze-batch` - Analyze multiple images
- `GET  /health` - Health check

## Demo Flow

1. Open frontend at `localhost:3000`
2. Click **Create Test** → fill details → note the 6-digit test code
3. Open a second browser/incognito window
4. Click **Join Exam** → enter the code
5. Allow webcam access
6. The student page starts sending snapshots to the ML service
7. Open **Live Dashboard** to see real-time warnings
8. Try looking away, covering your face, or opening another tab

## For Production

- Replace in-memory storage with PostgreSQL / MongoDB
- Add JWT authentication
- Use Redis adapter for Socket.io scaling
- Containerize with Docker
- Deploy ML service on GPU for even lower latency
- Add face enrollment / recognition for identity verification

## License

Same as original - MIT
