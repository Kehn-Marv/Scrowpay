@echo off
echo ========================================
echo   ScrowPay Local Development Server
echo ========================================
echo.
echo Starting server on http://localhost:8000
echo.
echo Open your browser and go to:
echo   http://localhost:8000/account-creation.html
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

python -m http.server 8000

pause
