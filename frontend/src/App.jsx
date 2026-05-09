import React, { useState } from 'react';
import Landing from './components/Landing';
import CreateQuiz from './components/CreateTest';
import JoinQuiz from './components/JoinTest';
import QuizRoom from './components/ExamRoom';
import AdminDashboard from './components/AdminDashboard';
import Results from './components/Results';

function App() {
  const [view, setView] = useState('landing');
  const [user, setUser] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [resultsData, setResultsData] = useState({ score: 0, totalQuestions: 0, cheatAttempts: 0, sessionId: null });

  const backendUrl = 'http://localhost:5000';
  const mlUrl = 'http://localhost:8000';

  return (
    <div style={{ minHeight: '100vh' }}>
      {view === 'landing' && <Landing setView={setView} />}
      {view === 'create' && (
        <CreateQuiz
          backendUrl={backendUrl}
          setView={setView}
          setQuiz={setQuiz}
          setUser={setUser}
        />
      )}
      {view === 'join' && (
        <JoinQuiz
          backendUrl={backendUrl}
          setView={setView}
          setUser={setUser}
          setQuiz={setQuiz}
        />
      )}
      {view === 'exam' && (
        <QuizRoom
          backendUrl={backendUrl}
          mlUrl={mlUrl}
          user={user}
          quiz={quiz}
          setView={setView}
          setResultsData={setResultsData}
        />
      )}
      {view === 'results' && (
        <Results
          score={resultsData.score}
          totalQuestions={resultsData.totalQuestions}
          cheatAttempts={resultsData.cheatAttempts}
          sessionId={resultsData.sessionId}
          backendUrl={backendUrl}
          quiz={quiz}
          user={user}
          setView={setView}
        />
      )}
      {view === 'dashboard' && (
        <AdminDashboard
          backendUrl={backendUrl}
          quiz={quiz}
          setView={setView}
        />
      )}
    </div>
  );
}

export default App;
