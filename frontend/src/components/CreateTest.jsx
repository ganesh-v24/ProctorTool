import React, { useState } from 'react';

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e2e8f0',
  fontSize: '14px',
  marginBottom: '10px',
};

const btnPrimary = {
  padding: '10px 16px',
  borderRadius: '8px',
  border: 'none',
  background: '#38bdf8',
  color: '#0f172a',
  fontWeight: 700,
  fontSize: '14px',
  cursor: 'pointer',
};

const btnSecondary = {
  padding: '8px 14px',
  borderRadius: '8px',
  border: '1px solid #475569',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: '13px',
  cursor: 'pointer',
};

const card = {
  background: '#1e293b',
  borderRadius: '16px',
  padding: '32px',
  maxWidth: '600px',
  width: '90%',
  margin: '40px auto',
};

const SAMPLE_QUESTIONS = [
  { text: "What is the capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], correctIndex: 2 },
  { text: "What is 2 + 2 × 2?", options: ["6", "8", "4", "10"], correctIndex: 0 },
  { text: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], correctIndex: 1 },
];

export default function CreateQuiz({ backendUrl, setView, setQuiz, setUser }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('Cheating Detection Demo Quiz');
  const [duration, setDuration] = useState(5);
  const [questions, setQuestions] = useState(SAMPLE_QUESTIONS);
  const [created, setCreated] = useState(null);

  const handleCreate = async () => {
    if (!name || !email || !title) return alert('Fill all required fields');

    const userRes = await fetch(`${backendUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    const userData = await userRes.json();
    setUser(userData.user);

    const quizRes = await fetch(`${backendUrl}/api/quizzes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        durationMinutes: Number(duration),
        questions,
        createdBy: userData.user.id,
      }),
    });
    const quizData = await quizRes.json();
    setQuiz(quizData.quiz);
    setCreated(quizData.quiz);
  };

  return (
    <div style={card}>
      <button onClick={() => setView('landing')} style={{ marginBottom: '16px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
        Back
      </button>
      <h2 style={{ marginBottom: '20px' }}>Create Quiz</h2>

      {!created ? (
        <>
          <input style={inputStyle} placeholder="Your Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input style={inputStyle} placeholder="Your Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={inputStyle} placeholder="Quiz Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input style={inputStyle} type="number" placeholder="Duration (minutes)" value={duration} onChange={(e) => setDuration(e.target.value)} />
          
          <div style={{ marginTop: '16px', marginBottom: '16px' }}>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '10px' }}>Sample Questions (3 pre-loaded)</p>
            {questions.map((q, i) => (
              <div key={i} style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', marginBottom: '8px' }}>
                <p style={{ margin: '0 0 6px', fontSize: '14px' }}>{i + 1}. {q.text}</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{q.options.join(' / ')}</p>
              </div>
            ))}
          </div>
          
          <button style={btnPrimary} onClick={handleCreate}>Create Quiz & Start Proctoring</button>
        </>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '18px', marginBottom: '12px' }}>Quiz Created!</p>
          <div style={{ background: '#0f172a', padding: '20px', borderRadius: '10px', marginBottom: '16px' }}>
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>Quiz Code</p>
            <p style={{ fontSize: '32px', fontWeight: 800, color: '#38bdf8', letterSpacing: '4px' }}>{created.code}</p>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '20px' }}>Share this code with students. Try cheating during the quiz!</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button style={btnPrimary} onClick={() => setView('dashboard')}>Proctor Dashboard</button>
            <button style={btnSecondary} onClick={() => { setQuiz(created); setView('exam'); }}>Take Quiz (Test Cheating)</button>
          </div>
        </div>
      )}
    </div>
  );
}
