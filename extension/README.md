# Aankh v2 - Chrome Extension

## Installation (Developer Mode)

1. Open Chrome/Edge and navigate to `chrome://extensions` or `edge://extensions`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select this `extension/` folder

## Features

- **Tab Switch Detection**: Monitors `tabs.onActivated`, `tabs.onUpdated`, and `windows.onFocusChanged`
- **DevTools Detection**: Detects if browser developer tools are opened
- **Fullscreen Monitoring**: Fires warning when user exits fullscreen
- **Copy/Paste Block**: Prevents copy, cut, and paste during exams
- **Right-Click Block**: Disables context menu during exams
- **Page Visibility**: Detects when user switches away from exam tab (alt-tab, minimize)

## Permissions

- `storage`: Store exam active state
- `tabs`: Track tab changes
- `activeTab` + `scripting`: Inject content scripts
- `host_permissions: <all_urls>`: Work on any exam platform

## How it works with the main app

The extension communicates with the Node.js backend via Socket.io:
- Background script sends `browser-event` messages
- Backend aggregates them into the proctoring dashboard
