const statusDiv = document.getElementById('status');
const toggleBtn = document.getElementById('toggleBtn');
const logDiv = document.getElementById('log');

function updateUI(active) {
  if (active) {
    statusDiv.textContent = 'Exam Active';
    statusDiv.className = 'status active';
    toggleBtn.textContent = 'End Proctoring';
    toggleBtn.className = 'end';
  } else {
    statusDiv.textContent = 'Exam Inactive';
    statusDiv.className = 'status inactive';
    toggleBtn.textContent = 'Start Proctoring';
    toggleBtn.className = 'start';
  }
}

chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
  if (res) updateUI(res.examActive);
});

toggleBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (!res) return;
    if (res.examActive) {
      chrome.runtime.sendMessage({ type: 'END_EXAM' }, () => {
        updateUI(false);
        addLog('Proctoring ended');
      });
    } else {
      chrome.runtime.sendMessage({
        type: 'START_EXAM',
        sessionId: 'demo-session',
        testId: 'demo-test',
        userId: 'demo-user',
        userName: 'Demo Student'
      }, () => {
        updateUI(true);
        addLog('Proctoring started');
      });
    }
  });
});

function addLog(msg) {
  const entry = document.createElement('div');
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logDiv.prepend(entry);
}
