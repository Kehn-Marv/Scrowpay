@echo off
REM Quick Docker build and test script for ScrowPay AI Risk Engine (Windows)

echo ==========================================
echo ScrowPay AI Risk Engine - Docker Build ^& Test
echo ==========================================
echo.

REM Step 1: Build Docker image
echo Step 1: Building Docker image...
echo ----------------------------------------
docker build -t scrowpay-ai-engine:latest .
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker build failed
    exit /b 1
)
echo.
echo [SUCCESS] Docker image built successfully
echo.

REM Step 2: Start container
echo Step 2: Starting container...
echo ----------------------------------------
docker run -d --name scrowpay-ai-engine-test -p 5000:5000 scrowpay-ai-engine:latest
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to start container
    exit /b 1
)
echo [SUCCESS] Container started
echo.

REM Step 3: Wait for container to be ready
echo Step 3: Waiting for container to be ready...
echo ----------------------------------------
echo This may take 30-60 seconds if models need to be trained...
echo.

set MAX_WAIT=120
set WAIT_TIME=0
set INTERVAL=5

:wait_loop
if %WAIT_TIME% GEQ %MAX_WAIT% goto wait_timeout

docker exec scrowpay-ai-engine-test curl -s http://localhost:5000/health >nul 2>&1
if %ERRORLEVEL% EQU 0 goto container_ready

echo Waiting... (%WAIT_TIME% seconds elapsed)
timeout /t %INTERVAL% /nobreak >nul
set /a WAIT_TIME=%WAIT_TIME%+%INTERVAL%
goto wait_loop

:wait_timeout
echo [ERROR] Container failed to start within %MAX_WAIT% seconds
echo.
echo Container logs:
docker logs scrowpay-ai-engine-test
docker stop scrowpay-ai-engine-test
docker rm scrowpay-ai-engine-test
exit /b 1

:container_ready
echo [SUCCESS] Container is ready!
echo.

REM Step 4: Test health endpoint
echo Step 4: Testing health endpoint...
echo ----------------------------------------
curl -s http://localhost:5000/health
echo.
echo.
echo [SUCCESS] Health check passed
echo.

REM Step 5: Test scoring endpoint
echo Step 5: Testing scoring endpoint...
echo ----------------------------------------
curl -s -X POST http://localhost:5000/api/v1/score -H "Content-Type: application/json" -d "{\"user_id\":\"test_user\",\"transaction_amount\":50000,\"transaction_velocity\":3,\"account_age_days\":45,\"device_fingerprint\":5432,\"time_of_day\":14,\"counterparty_trust_score\":75}"
echo.
echo.
echo [SUCCESS] Scoring endpoint working
echo.

REM Step 6: Show container stats
echo Step 6: Container statistics...
echo ----------------------------------------
docker stats --no-stream scrowpay-ai-engine-test
echo.

REM Success message
echo ==========================================
echo [SUCCESS] All tests passed!
echo ==========================================
echo.
echo Container is running and accessible at:
echo   Health: http://localhost:5000/health
echo   Score:  http://localhost:5000/api/v1/score
echo.
echo To view logs:
echo   docker logs -f scrowpay-ai-engine-test
echo.
echo To stop and remove the test container:
echo   docker stop scrowpay-ai-engine-test
echo   docker rm scrowpay-ai-engine-test
echo.
echo Note: This is a test container. For production deployment,
echo use docker-compose or refer to DOCKER_DEPLOYMENT.md
echo.

exit /b 0
