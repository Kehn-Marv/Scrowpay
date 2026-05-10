# ScrowPay Local Development Server
# PowerShell script to start a local web server

Write-Host "========================================" -ForegroundColor Green
Write-Host "  ScrowPay Local Development Server" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Check if Python is installed
$pythonInstalled = $false
try {
    $pythonVersion = python --version 2>&1
    if ($pythonVersion -match "Python") {
        $pythonInstalled = $true
        Write-Host "✓ Python found: $pythonVersion" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Python not found" -ForegroundColor Yellow
}

if ($pythonInstalled) {
    Write-Host ""
    Write-Host "Starting server on http://localhost:8000" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Open your browser and go to:" -ForegroundColor White
    Write-Host "  http://localhost:8000/account-creation.html" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    
    # Start Python HTTP server
    python -m http.server 8000
} else {
    Write-Host ""
    Write-Host "Python is not installed on your system." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Python from:" -ForegroundColor White
    Write-Host "  https://www.python.org/downloads/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or use one of these alternatives:" -ForegroundColor White
    Write-Host "  1. VS Code Live Server extension" -ForegroundColor Gray
    Write-Host "  2. Node.js http-server (npm install -g http-server)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
