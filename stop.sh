#!/bin/bash
# ProctorTool ML Service - Stop Script
# This stops the packaged ML proctoring service

echo "========================================"
echo "    ProctorTool ML Service - Shutdown   "
echo "========================================"
echo ""

# Kill process by name
echo "Stopping ML Service (proctor-ml-server & proctor_ml.main)..."
pkill -f "proctor-ml-server"
pkill -f "proctor_ml.main"
echo "ML Service stopped."

echo ""
echo "Stopping React Frontend Dashboard (Vite)..."
pkill -f "vite"
echo "React Frontend stopped."

echo ""
echo "========================================"
echo "All services stopped!"
echo "========================================"
