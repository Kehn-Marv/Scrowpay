@echo off
REM Quick Start Script for ScrowPay (Windows)
REM This script sets up and starts the development environment

echo ========================================
echo ScrowPay Development Environment Setup
echo ========================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not in PATH
    echo Please install Docker Desktop from: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM Check if docker-compose is installed
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker Compose is not installed or not in PATH
    echo Please install Docker Compose
    pause
    exit /b 1
)

echo [OK] Docker and Docker Compose are installed
echo.

REM Check if .env file exists
if not exist .env (
    echo WARNING: .env file not found
    echo Creating .env from .env.example...
    copy .env.example .env
    echo.
    echo IMPORTANT: Please edit .env file with your actual credentials:
    echo   - TURSO_DATABASE_URL
    echo   - TURSO_AUTH_TOKEN
    echo   - SQUAD_SECRET_KEY
    echo   - SQUAD_PUBLIC_KEY
    echo   - HOLDING_ACCOUNT
    echo.
    echo Press any key to open .env file in notepad...
    pause >nul
    notepad .env
    echo.
    echo After editing .env, press any key to continue...
    pause >nul
)

echo [OK] .env file exists
echo.

REM Stop any running containers
echo Stopping any running containers...
docker-compose down >nul 2>&1

REM Start services
echo Starting ScrowPay services...
echo This may take a few minutes on first run (downloading images, training AI model)
echo.
docker-compose up -d

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start services
    echo Check the error messages above
    pause
    exit /b 1
)

echo.
echo ========================================
echo ScrowPay is now running!
echo ========================================
echo.
echo Frontend:     http://localhost:8080
echo AI Engine:    http://localhost:5000
echo Health Check: http://localhost:5000/health
echo.
echo View logs:    docker-compose logs -f
echo Stop:         docker-compose down
echo.
echo Opening frontend in browser...
timeout /t 3 >nul
start http://localhost:8080/website.html

echo.
echo Press any key to view logs (Ctrl+C to exit logs)...
pause >nul
docker-compose logs -f
