import React from 'react';

const btnStyle = {
  padding: '14px 28px',
  border: 'none',
  borderRadius: '8px',
  fontSize: '16px',
  fontWeight: 600,
  cursor: 'pointer',
  margin: '10px',
  transition: 'transform 0.2s',
};

const cardStyle = {
  background: '#1e293b',
  borderRadius: '16px',
  padding: '40px',
  textAlign: 'center',
  maxWidth: '420px',
  width: '90%',
  boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
};

export default function Landing({ setView }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: '42px', marginBottom: '8px', color: '#38bdf8' }}>Aankh v2</h1>
        <p style={{ color: '#94a3b8', marginBottom: '32px' }}>AI-Powered Exam Proctoring</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            style={{ ...btnStyle, background: '#38bdf8', color: '#0f172a' }}
            onClick={() => setView('create')}
            onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
          >
            Create Test (Admin)
          </button>
          <button
            style={{ ...btnStyle, background: '#10b981', color: '#fff' }}
            onClick={() => setView('join')}
            onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
          >
            Join Quiz (Student)
          </button>
          <button
            style={{ ...btnStyle, background: '#475569', color: '#fff' }}
            onClick={() => setView('dashboard')}
            onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
          >
            Live Dashboard
          </button>
        </div>
        <p style={{ marginTop: '24px', fontSize: '12px', color: '#64748b' }}>
          Backend: Node.js + Socket.io | ML: MediaPipe + FastAPI
        </p>
      </div>
    </div>
  );
}
