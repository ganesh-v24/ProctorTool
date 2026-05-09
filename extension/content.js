(function () {
  'use strict';

  let examActive = false;

  // Check if exam mode is active
  chrome.storage.local.get(['ProctorTool_exam_active'], (result) => {
    examActive = !!result.ProctorTool_active;
    if (examActive) enableProctoring();
  });

  // Listen for activation from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'ACTIVATE_PROCTORING') {
      examActive = true;
      chrome.storage.local.set({ ProctorTool_active: true });
      enableProctoring();
    }
    if (msg.type === 'DEACTIVATE_PROCTORING') {
      examActive = false;
      chrome.storage.local.set({ ProctorTool_active: false });
      disableProctoring();
    }
  });

  // ============ Proctoring Controls ============

  function enableProctoring() {
    preventCopyPaste();
    preventRightClick();
    preventDevTools();
    monitorFullscreen();
    monitorVisibility();
  }

  function disableProctoring() {
    // Reloading is the easiest way to clean up all listeners
    // In production you'd want to track and remove listeners properly
  }

  // Prevent copy, cut, paste
  function preventCopyPaste() {
    ['copy', 'cut', 'paste'].forEach((event) => {
      document.addEventListener(event, (e) => {
        if (!examActive) return;
        e.preventDefault();
        reportEvent('copy-paste', { action: event });
        return false;
      }, true);
    });
  }

  // Prevent right click
  function preventRightClick() {
    document.addEventListener('contextmenu', (e) => {
      if (!examActive) return;
      e.preventDefault();
      reportEvent('right-click', {});
      return false;
    }, true);
  }

  // DevTools detection
  function preventDevTools() {
    const threshold = 160;
    const checkDevTools = () => {
      if (!examActive) return;
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;
      if (widthThreshold || heightThreshold) {
        reportEvent('devtools-opened', {});
      }
    };
    setInterval(checkDevTools, 2000);
  }

  // Fullscreen monitoring
  function monitorFullscreen() {
    document.addEventListener('fullscreenchange', () => {
      if (!examActive) return;
      if (!document.fullscreenElement) {
        reportEvent('fullscreen-exit', {});
      }
    });
  }

  // Page visibility (alt-tab, minimize)
  function monitorVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (!examActive) return;
      if (document.hidden) {
        reportEvent('tab-switch', { reason: 'page-hidden' });
      }
    });
  }

  // Send event to background script
  function reportEvent(eventType, data) {
    chrome.runtime.sendMessage({
      type: 'BROWSER_EVENT',
      eventType,
      data
    });
  }
})();
