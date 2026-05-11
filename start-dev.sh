#!/bin/bash
# Quick Start Script for ScrowPay (Mac/Linux)
# This script sets up and starts the development environment

set -e  # Exit on error

echo "========================================"
echo "ScrowPay Development Environment Setup"
echo "========================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed"
    echo "Please install Docker from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "ERROR: Docker Compose is not installed"
    echo "Please install Docker Compose"
    exit 1
fi

echo "[OK] Docker and Docker Compose are installed"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "WARNING: .env file not found"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "IMPORTANT: Please edit .env file with your actual credentials:"
    echo "  - TURSO_DATABASE_URL"
    echo "  - TURSO_AUTH_TOKEN"
    echo "  - SQUAD_SECRET_KEY"
    echo "  - SQUAD_PUBLIC_KEY"
    echo "  - HOLDING_ACCOUNT"
    echo ""
    echo "Opening .env file in default editor..."
    
    # Try to open in default editor
    if command -v nano &> /dev/null; then
        nano .env
    elif command -v vim &> /dev/null; then
        vim .env
    elif command -v vi &> /dev/null; then
        vi .env
    else
        echo "Please edit .env manually with your preferred editor"
        echo "Press Enter to continue after editing..."
        read
    fi
fi

echo "[OK] .env file exists"
echo ""

# Stop any running containers
echo "Stopping any running containers..."
docker-compose down > /dev/null 2>&1 || true

# Start services
echo "Starting ScrowPay services..."
echo "This may take a few minutes on first run (downloading images, training AI model)"
echo ""
docker-compose up -d

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Failed to start services"
    echo "Check the error messages above"
    exit 1
fi

echo ""
echo "========================================"
echo "ScrowPay is now running!"
echo "========================================"
echo ""
echo "Frontend:     http://localhost:8080"
echo "AI Engine:    http://localhost:5000"
echo "Health Check: http://localhost:5000/health"
echo ""
echo "View logs:    docker-compose logs -f"
echo "Stop:         docker-compose down"
echo ""

# Try to open browser
if command -v open &> /dev/null; then
    # macOS
    echo "Opening frontend in browser..."
    sleep 3
    open http://localhost:8080/website.html
elif command -v xdg-open &> /dev/null; then
    # Linux
    echo "Opening frontend in browser..."
    sleep 3
    xdg-open http://localhost:8080/website.html
else
    echo "Please open http://localhost:8080/website.html in your browser"
fi

echo ""
echo "Press Enter to view logs (Ctrl+C to exit logs)..."
read
docker-compose logs -f
