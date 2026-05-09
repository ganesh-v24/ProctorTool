import React, { useEffect, useState } from 'react';

const card = {
  background: '#1e293b',
  borderRadius: '16px',
  padding: '32px',
  maxWidth: '700px',
  width: '90%',
  margin: '40px auto',
};

const severityColor = (s) => ({
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}[s] || '#94a3b8');

const severityBg = (s) => ({
  critical: 'rgba(239,68,68,0.15)',
  high: 'rgba(249,115,22,0.15)',
  medium: 'rgba(234,179,8,0.15)',
  low: 'rgba(34,197,94,0.15)',
}[s] || 'rgba(148,163,184,0.15)');

export default function Results({ score, totalQuestions, cheatAttempts, sessionId, backendUrl, quiz, user, setView }) {
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionId) {
      fetch(`${backendUrl}/api/sessions/${sessionId}/warnings`)
        .then(r => r.json())
        .then(data => {
          setWarnings(data.warnings || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [sessionId, backendUrl]);

  const severityCounts = warnings.reduce((acc, w) => {
    acc[w.severity] = (acc[w.severity] || 0) + 1;
    return acc;
  }, {});

  const typeCounts = warnings.reduce((acc, w) => {
    acc[w.type] = (acc[w.type] || 0) + 1;
    return acc;
  }, {});

  const percentage = Math.round((score / totalQuestions) * 100);
  const isCheater = cheatAttempts > 0;

  return (
    <div style={card}>
      <h2 style={{ marginBottom: '8px', textAlign: 'center' }}>Quiz Results</h2>
      <p style={{ color: '#94a3b8', textAlign: 'center', marginBottom: '24px', fontSize: '14px' }}>
        {quiz?.title} — {user?.name}
      </p>

      {/* Score Card */}
      <div style={{
        background: '#0f172a',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-around',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '4px' }}>Score</p>
          <p style={{ fontSize: '36px', fontWeight: 800, color: percentage >= 60 ? '#10b981' : '#ef4444' }}>
            {score}<span style={{ fontSize: '18px', color: '#64748b' }}>/{totalQuestions}</span>
          </p>
          <p style={{ color: '#64748b', fontSize: '12px' }}>{percentage}%</p>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '4px' }}>Status</p>
          <p style={{
            fontSize: '18px',
            fontWeight: 700,
            color: isCheater ? '#ef4444' : '#10b981',
            padding: '6px 16px',
            borderRadius: '20px',
            background: isCheater ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
            display: 'inline-block',
          }}>
            {isCheater ? 'Suspicious Activity Detected' : 'Clean Record'}
          </p>
        </div>

        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '4px' }}>Alerts</p>
          <p style={{ fontSize: '36px', fontWeight: 800, color: cheatAttempts > 0 ? '#ef4444' : '#10b981' }}>
            {cheatAttempts}
          </p>
          <p style={{ color: '#64748b', fontSize: '12px' }}>total warnings</p>
        </div>
      </div>

      {/* Cheating Breakdown */}
      {Object.keys(typeCounts).length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Detected Behaviors</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {Object.entries(typeCounts).map(([type, count]) => (
              <span key={type} style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                border: '1px solid #334155',
              }}>
                {type.replace(/_/g, ' ')}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Severity Breakdown */}
      {Object.keys(severityCounts).length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Severity Breakdown</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {Object.entries(severityCounts).map(([sev, count]) => (
              <div key={sev} style={{
                background: severityBg(sev),
                border: `1px solid ${severityColor(sev)}`,
                color: severityColor(sev),
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
              }}>
                {sev.toUpperCase()}: {count}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Alert Timeline</h3>
        {loading ? (
          <p style={{ color: '#64748b', fontSize: '13px' }}>Loading warnings from database...</p>
        ) : warnings.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '13px' }}>No warnings recorded. Perfect behavior!</p>
        ) : (
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {warnings.map((w, i) => (
              <div key={i} style={{
                background: '#0f172a',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderLeft: `3px solid ${severityColor(w.severity)}`,
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#e2e8f0' }}>{w.message}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                    {new Date(w.timestamp).toLocaleTimeString()} — {w.type}
                  </p>
                </div>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: severityColor(w.severity),
                  background: severityBg(w.severity),
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}>
                  {w.severity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button
          onClick={() => setView('landing')}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            border: 'none',
            background: '#38bdf8',
            color: '#0f172a',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Back to Home
        </button>
        <button
          onClick={() => setView('dashboard')}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            border: '1px solid #475569',
            background: 'transparent',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          View Dashboard
        </button>
      </div>
    </div>
  );
}
