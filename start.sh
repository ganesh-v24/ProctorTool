#!/bin/bash
# ProctorTool ML Service - Quick Start Script (Bash)
# This starts the packaged ML proctoring service on port 8000

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_IP="10.80.4.112"

echo "========================================"
echo "    ProctorTool ML Service - Startup    "
echo "========================================"
echo "Service Endpoint: http://$NETWORK_IP:8000"
echo ""

# Function to start a service in background
start_service() {
    local title=$1
    local command=$2
    local directory=$3
    local log_file=$4
    
    echo "[$title] Starting in $directory..."
    cd "$directory" || exit 1
    nohup bash -c "$command" > "$log_file" 2>&1 &
    echo "[$title] Started with PID: $!"
    echo "[$title] Log file: $log_file"
    echo ""
}

# Create logs directory
mkdir -p "$ROOT_DIR/logs"

# ML Service
echo "Starting ML Service (Python FastAPI) on port 8000..."
cd "$ROOT_DIR/ml_service" || exit 1
./venv/bin/python -m pip install -e .
start_service "ML Service" "./venv/bin/python -m proctor_ml.main" "$ROOT_DIR/ml_service" "$ROOT_DIR/logs/ml-service.log"
sleep 2

# React Frontend Dashboard
echo "Starting React Frontend Dashboard on port 3000..."
start_service "React Frontend" "npm run dev" "$ROOT_DIR/novelProctorDashboard" "$ROOT_DIR/logs/frontend.log"

echo "========================================"
echo "All services started in background!"
echo "========================================"
echo "  - React Dashboard: http://$NETWORK_IP:3000"
echo "  - ML API Health:   http://$NETWORK_IP:8000/health"
echo ""
echo "Log files:"
echo "  - ML Service:      $ROOT_DIR/logs/ml-service.log"
echo "  - React Dashboard: $ROOT_DIR/logs/frontend.log"
echo ""
echo "To stop services, run: ./stop.sh"
echo ""
