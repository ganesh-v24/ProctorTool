import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const card = {
  background: '#1e293b',
  borderRadius: '16px',
  padding: '24px',
  maxWidth: '1000px',
  width: '95%',
  margin: '20px auto',
};

const severityColor = (s) => (s === 'critical' ? '#ef4444' : s === 'high' ? '#f97316' : '#eab308');

export default function AdminDashboard({ backendUrl, quiz, setView }) {
  const [sessions, setSessions] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const s = io(backendUrl);
    setSocket(s);

    s.on('connect', () => {
      console.log('Dashboard connected');
      // Join all test rooms to listen
      s.emit('join-admin');
    });

    s.on('student-joined', ({ userName, sessionId }) => {
      setSessions((prev) => {
        if (prev.find((p) => p.sessionId === sessionId)) return prev;
        return [...prev, { sessionId, userName, warnings: 0, status: 'active' }];
      });
      setLiveEvents((prev) => [
        { type: 'info', message: `${userName} joined`, timestamp: new Date().toISOString() },
        ...prev.slice(0, 49),
      ]);
    });

    s.on('student-left', ({ sessionId, userName }) => {
      setSessions((prev) =>
        prev.map((p) => (p.sessionId === sessionId ? { ...p, status: 'ended' } : p))
      );
      setLiveEvents((prev) => [
        { type: 'info', message: `${userName} left`, timestamp: new Date().toISOString() },
        ...prev.slice(0, 49),
      ]);
    });

    s.on('proctor-alert', ({ sessionId, userName, events }) => {
      setSessions((prev) =>
        prev.map((p) =>
          p.sessionId === sessionId ? { ...p, warnings: p.warnings + events.length } : p
        )
      );
      events.forEach((e) => {
        setLiveEvents((prev) => [
          {
            type: 'warning',
            severity: e.severity,
            message: `${userName}: ${e.message}`,
            timestamp: e.timestamp,
          },
          ...prev.slice(0, 49),
        ]);
      });
    });

    return () => s.disconnect();
  }, [backendUrl]);

  // Load existing test data
  useEffect(() => {
    if (quiz?._id) {
      fetch(`${backendUrl}/api/quizzes/${quiz._id}/dashboard`)
        .then((r) => r.json())
        .then((data) => {
          if (data.sessions) {
            setSessions(
              data.sessions.map((s) => ({
                sessionId: s.sessionId,
                userName: s.userName,
                warnings: s.warningCount,
                status: s.status,
              }))
            );
          }
        })
        .catch(() => {});
    }
  }, [backendUrl, quiz]);

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Proctor Dashboard</h2>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0' }}>
            {quiz ? `Quiz: ${quiz.title} (${quiz.code})` : 'Live Monitoring'}
          </p>
        </div>
        <button
          onClick={() => setView('landing')}
          style={{ background: '#475569', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
        >
          Back
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Active Students */}
        <div>
          <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>Active Students ({sessions.filter((s) => s.status === 'active').length})</h3>
          {sessions.length === 0 && <p style={{ color: '#64748b', fontSize: '13px' }}>No active sessions</p>}
          {sessions.map((s) => (
            <div
              key={s.sessionId}
              style={{
                background: s.status === 'active' ? '#0f172a' : '#1e293b',
                borderLeft: `4px solid ${s.warnings > 3 ? '#ef4444' : s.warnings > 0 ? '#f97316' : '#10b981'}`,
                padding: '12px 14px',
                borderRadius: '8px',
                marginBottom: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <p style={{ fontWeight: 600, margin: 0 }}>{s.userName}</p>
                <p style={{ color: '#64748b', fontSize: '12px', margin: '2px 0 0' }}>
                  {s.status === 'active' ? 'In Exam' : 'Left'} | Warnings: {s.warnings}
                </p>
              </div>
              {s.warnings > 0 && (
                <span
                  style={{
                    background: s.warnings > 3 ? '#7f1d1d' : '#7c2d12',
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  {s.warnings}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Live Events Feed */}
        <div>
          <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>Live Events</h3>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {liveEvents.length === 0 && <p style={{ color: '#64748b', fontSize: '13px' }}>No events yet</p>}
            {liveEvents.map((e, i) => (
              <div
                key={i}
                style={{
                  background: e.type === 'warning' ? '#7c2d12' : '#0f172a',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  fontSize: '13px',
                  borderLeft: e.type === 'warning' ? `3px solid ${severityColor(e.severity)}` : '3px solid #38bdf8',
                }}
              >
                <p style={{ margin: 0, color: '#e2e8f0' }}>{e.message}</p>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '11px' }}>
                  {new Date(e.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
