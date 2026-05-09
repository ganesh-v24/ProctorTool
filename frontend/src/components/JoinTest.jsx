import React, { useState } from 'react';

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '8px',
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e2e8f0',
  fontSize: '15px',
  marginBottom: '14px',
};

const btnPrimary = {
  width: '100%',
  padding: '12px',
  borderRadius: '8px',
  border: 'none',
  background: '#10b981',
  color: '#fff',
  fontWeight: 700,
  fontSize: '15px',
  cursor: 'pointer',
};

const card = {
  background: '#1e293b',
  borderRadius: '16px',
  padding: '32px',
  maxWidth: '460px',
  width: '90%',
  margin: '40px auto',
};

export default function JoinQuiz({ backendUrl, setView, setUser, setQuiz }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const handleJoin = async () => {
    if (!name || !email || !code) return alert('Fill all fields');

    const userRes = await fetch(`${backendUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    const userData = await userRes.json();
    setUser(userData.user);

    const quizRes = await fetch(`${backendUrl}/api/quizzes/code/${code.toUpperCase()}`);
    if (!quizRes.ok) return alert('Quiz not found');
    const quizData = await quizRes.json();
    setQuiz(quizData.quiz);
    setView('exam');
  };

  return (
    <div style={card}>
      <button onClick={() => setView('landing')} style={{ marginBottom: '16px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
        Back
      </button>
      <h2 style={{ marginBottom: '20px' }}>Join Quiz</h2>
      <input style={inputStyle} placeholder="Your Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input style={inputStyle} placeholder="Your Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input style={inputStyle} placeholder="Quiz Code (e.g. AB12CD)" value={code} onChange={(e) => setCode(e.target.value)} />
      <button style={btnPrimary} onClick={handleJoin}>Enter Quiz Room</button>
    </div>
  );
}
