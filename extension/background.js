let examActive = false;
let socket = null;
let sessionId = null;
let backendUrl = 'http://localhost:5000';

// Initialize WebSocket connection
function connectSocket() {
  if (socket && socket.connected) return;
  socket = io(backendUrl);

  socket.on('connect', () => {
    console.log('[ProctorTool] Connected to proctoring server');
  });

  socket.on('warnings', (warnings) => {
    console.log('[ProctorTool] Warnings received:', warnings);
  });
}

// Listen for messages from content script / popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_EXAM') {
    examActive = true;
    sessionId = message.sessionId;
    backendUrl = message.backendUrl || backendUrl;
    connectSocket();
    if (socket && sessionId) {
      socket.emit('join-exam', {
        testId: message.testId,
        userId: message.userId,
        userName: message.userName
      });
    }
    sendResponse({ status: 'started' });
  }

  if (message.type === 'END_EXAM') {
    examActive = false;
    if (socket && sessionId) {
      socket.emit('end-exam', { sessionId });
    }
    sessionId = null;
    sendResponse({ status: 'ended' });
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({ examActive, sessionId });
  }

  if (message.type === 'BROWSER_EVENT' && examActive && socket && sessionId) {
    socket.emit('browser-event', {
      sessionId,
      eventType: message.eventType,
      data: message.data || {}
    });
  }

  return true;
});

// Tab change detection
chrome.tabs.onActivated.addListener(() => {
  if (!examActive || !sessionId) return;
  chrome.runtime.sendMessage({
    type: 'BROWSER_EVENT',
    eventType: 'tab-switch',
    data: { reason: 'tab-activated' }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!examActive || !sessionId) return;
  if (changeInfo.url || changeInfo.title) {
    chrome.runtime.sendMessage({
      type: 'BROWSER_EVENT',
      eventType: 'tab-switch',
      data: { url: tab.url, title: tab.title }
    });
  }
});

// Window focus detection
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (!examActive || !sessionId) return;
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    chrome.runtime.sendMessage({
      type: 'BROWSER_EVENT',
      eventType: 'tab-switch',
      data: { reason: 'window-blurred' }
    });
  }
});
