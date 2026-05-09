import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { io } from 'socket.io-client';

const card = {
  background: '#1e293b',
  borderRadius: '16px',
  padding: '20px',
  maxWidth: '1100px',
  width: '95%',
  margin: '16px auto',
};

const alertStyle = (severity) => ({
  background: severity === 'critical' ? '#7f1d1d' : severity === 'high' ? '#7c2d12' : '#713f12',
  color: '#fef3c7',
  padding: '8px 12px',
  borderRadius: '6px',
  marginBottom: '6px',
  fontSize: '13px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export default function QuizRoom({ backendUrl, mlUrl, user, quiz, setView, setResultsData }) {
  const webcamRef = useRef(null);
  const webcamContainerRef = useRef(null);
  const socketRef = useRef(null);
  const [sessionId, setSessionId] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [status, setStatus] = useState('Initializing...');
  const [mlStatus, setMlStatus] = useState('idle');
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [cheatAttempts, setCheatAttempts] = useState(0);

  const questions = quiz?.questions || [];

  // Initialize Socket.io
  useEffect(() => {
    const socket = io(backendUrl);
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('Connected. Starting proctoring...');
      socket.emit('join-exam', {
        quizCode: quiz.code,
        userId: user.id,
        userName: user.name,
      });
    });

    socket.on('session-started', ({ sessionId }) => {
      setSessionId(sessionId);
      setStatus('Proctoring active. Try cheating and watch the warnings!');
    });

    socket.on('warnings', (newWarnings) => {
      setWarnings((prev) => [...newWarnings, ...prev].slice(0, 50));
      setCheatAttempts((c) => c + newWarnings.length);
    });

    return () => {
      socket.disconnect();
    };
  }, [backendUrl, quiz.code, user.id, user.name]);

  // Capture and analyze snapshots
  const captureAndAnalyze = useCallback(async () => {
    if (!webcamRef.current || !sessionId) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    setSnapshotCount((c) => c + 1);
    setMlStatus('analyzing');

    try {
      socketRef.current?.emit('snapshot', { sessionId, image: imageSrc });
      const res = await fetch(`${mlUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageSrc }),
      });
      const result = await res.json();
      setLastResult(result);
      setMlStatus('idle');

      if (!result.error) {
        socketRef.current?.emit('ml-result', {
          sessionId,
          results: {
            faceDetected: result.faceDetected,
            multiplePeople: result.multiplePeople,
            faceCovered: result.faceCovered,
            lookingAway: result.lookingAway,
            tabSwitched: false,
            devToolsOpen: false,
          },
        });
      }
    } catch (err) {
      setMlStatus('error');
      console.error('ML analysis error:', err);
    }
  }, [sessionId, mlUrl]);

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(captureAndAnalyze, 2000); // Every 2 seconds for fast detection
    return () => clearInterval(interval);
  }, [sessionId, captureAndAnalyze]);

  const handleAnswer = (qIndex, optionIndex) => {
    setAnswers((prev) => ({ ...prev, [qIndex]: optionIndex }));
  };

  const handleSubmit = () => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) correct++;
    });
    if (socketRef.current && sessionId) {
      socketRef.current.emit('end-exam', { sessionId });
    }
    setResultsData({
      score: correct,
      totalQuestions: questions.length,
      cheatAttempts,
      sessionId,
    });
    setView('results');
  };

  const handleEnd = () => {
    if (socketRef.current && sessionId) {
      socketRef.current.emit('end-exam', { sessionId });
    }
    setView('landing');
  };

  const severityColor = (s) => (s === 'critical' ? '#ef4444' : s === 'high' ? '#f97316' : '#eab308');

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>{quiz.title}</h2>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>
            {user.name} | Snapshots: {snapshotCount} | ML: {mlStatus} | Cheats detected: {cheatAttempts}
          </p>
        </div>
        <button
          onClick={handleEnd}
          style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
        >
          End Quiz
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px 260px', gap: '16px' }}>
        {/* Quiz Panel */}
        <div style={{ background: '#0f172a', borderRadius: '12px', padding: '20px' }}>
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Question {currentQ + 1} of {questions.length}</span>
              <span style={{ color: '#38bdf8', fontSize: '13px', fontWeight: 600 }}>{Math.round(((currentQ + 1) / questions.length) * 100)}%</span>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '17px', marginBottom: '16px', lineHeight: 1.5 }}>{questions[currentQ]?.text}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {questions[currentQ]?.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(currentQ, i)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: answers[currentQ] === i ? '2px solid #38bdf8' : '1px solid #334155',
                      background: answers[currentQ] === i ? '#1e3a5f' : '#1e293b',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    {String.fromCharCode(65 + i)}. {opt}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
              <button
                onClick={() => setCurrentQ((c) => Math.max(0, c - 1))}
                disabled={currentQ === 0}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #475569', background: 'transparent', color: '#94a3b8', cursor: currentQ === 0 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              {currentQ < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentQ((c) => c + 1)}
                  style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#38bdf8', color: '#0f172a', fontWeight: 700, cursor: 'pointer' }}
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Submit Quiz
                </button>
              )}
            </div>
          </>
        </div>

        {/* Webcam */}
        <div>
          <div ref={webcamContainerRef} style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#0f172a', border: '2px solid #334155', marginBottom: '10px' }}>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.85}
              width="100%"
              videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
            />
            {lastResult && lastResult.faceDetected && lastResult.faceBox && (() => {
              const container = webcamContainerRef.current;
              if (!container) return null;
              const cw = container.clientWidth;
              const ch = container.clientHeight;
              const { x, y, w, h, img_w, img_h } = lastResult.faceBox;
              const scaleX = cw / img_w;
              const scaleY = ch / img_h;
              return (
                <div style={{
                  position: 'absolute',
                  left: x * scaleX,
                  top: y * scaleY,
                  width: w * scaleX,
                  height: h * scaleY,
                  border: '2px solid #22c55e',
                  borderRadius: '4px',
                  pointerEvents: 'none',
                  boxShadow: '0 0 8px rgba(34,197,94,0.5)',
                }} />
              );
            })()}
          </div>
          <p style={{ color: '#64748b', fontSize: '11px', margin: '0 0 8px' }}>{status}</p>

          {lastResult && (
            <div style={{ background: '#0f172a', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
              <p style={{ color: '#94a3b8', margin: '0 0 6px', fontSize: '11px' }}>
                Analysis ({lastResult.processingTimeMs}ms) — {lastResult.detector_used || 'none'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <MiniBadge ok={lastResult.faceDetected} label="Face" />
                <MiniBadge ok={!lastResult.multiplePeople} label="1 Person" />
                <MiniBadge ok={!lastResult.faceCovered} label="Visible" />
                <MiniBadge ok={!lastResult.lookingAway} label="Screen" />
              </div>
              {lastResult.headPose && (
                <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: '10px' }}>
                  Yaw: {lastResult.headPose.yaw.toFixed(0)} | Pitch: {lastResult.headPose.pitch.toFixed(0)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Warnings Panel */}
        <div>
          <h3 style={{ marginBottom: '10px', fontSize: '14px', color: '#fca5a5' }}>
            Proctor Alerts ({warnings.length})
          </h3>
          <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
            {warnings.length === 0 && (
              <p style={{ color: '#64748b', fontSize: '12px' }}>No alerts. Try looking away or covering your face!</p>
            )}
            {warnings.map((w, i) => (
              <div key={i} style={alertStyle(w.severity)}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: severityColor(w.severity), display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: '12px' }}>{w.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniBadge({ ok, label }) {
  return (
    <span style={{
      background: ok ? '#064e3b' : '#7f1d1d',
      color: ok ? '#10b981' : '#ef4444',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: 600,
    }}>
      {ok ? 'OK' : 'X'} {label}
    </span>
  );
}
