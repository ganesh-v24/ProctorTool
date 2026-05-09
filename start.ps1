# ProctorTool - Quick Start Script (PowerShell)
# This starts the backend, ML service, and frontend

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "       ProctorTool - Starting Services     " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Function to start a process in a new window
function Start-ServiceWindow($Title, $Command, $Directory) {
    $cmd = "cd `"$Directory`"; $Command; Read-Host 'Press Enter to close'"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -WindowStyle Normal
}

# 1. ML Service
Write-Host "[1/3] Starting ML Service (Python FastAPI + MediaPipe) on port 8000..." -ForegroundColor Green
Start-ServiceWindow "ProctorTool2 - ML Service" "python app.py" "$root\ml-service"
Start-Sleep -Seconds 3

# 2. Backend
Write-Host "[2/3] Starting Backend (Node.js + Socket.io) on port 5000..." -ForegroundColor Green
Start-ServiceWindow "ProctorTool - Backend" "npm install; npm start" "$root\backend"
Start-Sleep -Seconds 3

# 3. Frontend
Write-Host "[3/3] Starting Frontend (React + Vite) on port 3000..." -ForegroundColor Green
Start-ServiceWindow "ProctorTool - Frontend" "npm install; npm run dev" "$root\frontend"

Write-Host "" 
Write-Host "All services starting in separate windows!" -ForegroundColor Cyan
Write-Host "  - Frontend:  http://localhost:3000" -ForegroundColor Yellow
Write-Host "  - Backend:   http://localhost:5000" -ForegroundColor Yellow
Write-Host "  - ML API:    http://localhost:8000" -ForegroundColor Yellow
Write-Host ""
Write-Host "Don't forget to load the Chrome extension from the extension/ folder!" -ForegroundColor Magenta
