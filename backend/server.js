const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// =========================
// MongoDB Models
// =========================

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctIndex: { type: Number, required: true }
});

const quizSchema = new mongoose.Schema({
  title: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  durationMinutes: { type: Number, default: 10 },
  questions: [questionSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true }
});

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  quizCode: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String },
  status: { type: String, enum: ['active', 'ended', 'disconnected'], default: 'active' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date }
});

const warningSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  type: { type: String, required: true },
  message: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  timestamp: { type: Date, default: Date.now },
  data: { type: Object }
});

const User = mongoose.model('User', userSchema);
const Quiz = mongoose.model('Quiz', quizSchema);
const Session = mongoose.model('Session', sessionSchema);
const Warning = mongoose.model('Warning', warningSchema);

// In-memory active sessions map for WebSocket speed
const activeSockets = new Map();

// =========================
// REST API
// =========================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'aankh-v2-backend', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// Auth
app.post('/api/auth/register', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  try {
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ name, email });
    }
    res.json({ user: { id: user._id, name: user.name, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { id: user._id, name: user.name, email: user.email } });
});

// Quiz CRUD
app.post('/api/quizzes', async (req, res) => {
  const { title, durationMinutes, questions, createdBy } = req.body;
  if (!title || !questions || !createdBy) return res.status(400).json({ error: 'Missing fields' });
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  try {
    const quiz = await Quiz.create({ title, code, durationMinutes: durationMinutes || 10, questions, createdBy });
    res.json({ quiz });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/quizzes', async (req, res) => {
  const quizzes = await Quiz.find().sort({ createdAt: -1 });
  res.json({ quizzes });
});

app.get('/api/quizzes/code/:code', async (req, res) => {
  const quiz = await Quiz.findOne({ code: req.params.code.toUpperCase() });
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  res.json({ quiz });
});

// Dashboard
app.get('/api/quizzes/:id/dashboard', async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  const sessions = await Session.find({ quizCode: quiz.code });
  const summary = [];
  for (const s of sessions) {
    const warningCount = await Warning.countDocuments({ sessionId: s.sessionId });
    summary.push({
      sessionId: s.sessionId,
      userId: s.userId,
      userName: s.userName,
      warningCount,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt
    });
  }
  res.json({ quiz, sessions: summary });
});

// Warnings
app.get('/api/sessions/:id/warnings', async (req, res) => {
  const warnings = await Warning.find({ sessionId: req.params.id }).sort({ timestamp: -1 });
  res.json({ warnings });
});

// =========================
// WebSocket Real-time Proctoring
// =========================

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-admin', () => {
    socket.join('admin');
    console.log('Admin joined dashboard:', socket.id);
  });

  socket.on('join-exam', async ({ quizCode, userId, userName }) => {
    const sessionId = uuidv4();
    const session = {
      sessionId,
      socketId: socket.id,
      quizCode: quizCode.toUpperCase(),
      userId,
      userName,
      status: 'active',
      startedAt: new Date()
    };
    await Session.create(session);
    activeSockets.set(sessionId, session);
    socket.sessionId = sessionId;
    socket.join(quizCode.toUpperCase());
    socket.emit('session-started', { sessionId });
    io.to(quizCode.toUpperCase()).emit('student-joined', { userId, userName, sessionId });
    io.to('admin').emit('student-joined', { userId, userName, sessionId });
    console.log(`Session ${sessionId} started for ${userName}`);
  });

  socket.on('snapshot', ({ sessionId, image }) => {
    // Snapshots are not stored in DB for speed; kept in memory only
    // Could be saved to GridFS if needed
  });

  socket.on('ml-result', async ({ sessionId, results }) => {
    const session = activeSockets.get(sessionId);
    if (!session) return;

    const { faceDetected, multiplePeople, faceCovered, lookingAway, tabSwitched, devToolsOpen } = results;
    const events = [];

    if (!faceDetected) events.push({ type: 'NO_FACE', message: 'Face not detected', severity: 'high' });
    if (multiplePeople) events.push({ type: 'MULTIPLE_PEOPLE', message: 'Multiple people detected', severity: 'critical' });
    if (faceCovered) events.push({ type: 'FACE_COVERED', message: 'Face partially covered', severity: 'high' });
    if (lookingAway) events.push({ type: 'LOOKING_AWAY', message: 'Candidate looking away from screen', severity: 'medium' });
    if (tabSwitched) events.push({ type: 'TAB_SWITCH', message: 'Tab/window switched', severity: 'high' });
    if (devToolsOpen) events.push({ type: 'DEVTOOLS', message: 'Developer tools opened', severity: 'high' });

    if (events.length > 0) {
      const timestamp = new Date();
      const warningDocs = events.map(e => ({
        sessionId,
        type: e.type,
        message: e.message,
        severity: e.severity,
        timestamp
      }));
      await Warning.insertMany(warningDocs);
      const warningBatch = events.map(e => ({ ...e, timestamp: timestamp.toISOString(), sessionId }));
      socket.emit('warnings', warningBatch);
      io.to(session.quizCode).emit('proctor-alert', { sessionId, userName: session.userName, events: warningBatch });
      io.to('admin').emit('proctor-alert', { sessionId, userName: session.userName, events: warningBatch });
    }
  });

  socket.on('browser-event', async ({ sessionId, eventType, data }) => {
    const session = activeSockets.get(sessionId);
    if (!session) return;

    const events = [];
    if (eventType === 'tab-switch') events.push({ type: 'TAB_SWITCH', message: 'Browser tab switched', severity: 'high', data });
    if (eventType === 'devtools-opened') events.push({ type: 'DEVTOOLS', message: 'DevTools detected', severity: 'high' });
    if (eventType === 'fullscreen-exit') events.push({ type: 'FULLSCREEN_EXIT', message: 'Left fullscreen mode', severity: 'medium' });
    if (eventType === 'copy-paste') events.push({ type: 'COPY_PASTE', message: 'Copy/paste detected', severity: 'low' });
    if (eventType === 'right-click') events.push({ type: 'RIGHT_CLICK', message: 'Right click detected', severity: 'low' });

    if (events.length > 0) {
      const timestamp = new Date();
      const warningDocs = events.map(e => ({
        sessionId,
        type: e.type,
        message: e.message,
        severity: e.severity,
        timestamp,
        data: e.data
      }));
      await Warning.insertMany(warningDocs);
      const warningBatch = events.map(e => ({ ...e, timestamp: timestamp.toISOString(), sessionId }));
      socket.emit('warnings', warningBatch);
      io.to(session.quizCode).emit('proctor-alert', { sessionId, userName: session.userName, events: warningBatch });
      io.to('admin').emit('proctor-alert', { sessionId, userName: session.userName, events: warningBatch });
    }
  });

  socket.on('end-exam', async ({ sessionId }) => {
    const session = activeSockets.get(sessionId);
    if (session) {
      session.status = 'ended';
      session.endedAt = new Date();
      await Session.updateOne({ sessionId }, { status: 'ended', endedAt: new Date() });
      io.to(session.quizCode).emit('student-left', { sessionId, userName: session.userName });
      io.to('admin').emit('student-left', { sessionId, userName: session.userName });
    }
    socket.leave(session?.quizCode);
    activeSockets.delete(sessionId);
  });

  socket.on('disconnect', async () => {
    const sessionId = socket.sessionId;
    if (sessionId) {
      const session = activeSockets.get(sessionId);
      if (session && session.status === 'active') {
        session.status = 'disconnected';
        await Session.updateOne({ sessionId }, { status: 'disconnected' });
        const alert = {
          sessionId,
          userName: session.userName,
          events: [{ type: 'DISCONNECTED', message: 'Student disconnected unexpectedly', severity: 'high', timestamp: new Date().toISOString() }]
        };
        io.to(session.quizCode).emit('proctor-alert', alert);
        io.to('admin').emit('proctor-alert', alert);
      }
      activeSockets.delete(sessionId);
    }
    console.log('Client disconnected:', socket.id);
  });
});

// =========================
// Start Server
// =========================

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aankh_v2';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, () => {
      console.log(`Aankh v2 backend running on port ${PORT}`);
      console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    console.log('Falling back to in-memory mode...');
    server.listen(PORT, () => {
      console.log(`Aankh v2 backend running on port ${PORT} (in-memory fallback)`);
    });
  });
