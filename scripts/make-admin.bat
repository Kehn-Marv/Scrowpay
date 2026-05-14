@echo off
REM ===================================================================
REM  make-admin.bat
REM  Double-click wrapper around make-admin.ps1 for Windows users who
REM  don't want to open PowerShell manually. Reads credentials from
REM  the project's .env file and promotes the phone number you set
REM  in $DEFAULT_PHONE at the top of make-admin.ps1.
REM
REM  Usage:
REM    make-admin.bat                       # uses $DEFAULT_PHONE in the .ps1
REM    make-admin.bat +2348012345678        # by phone number
REM    make-admin.bat --id 1                # by users.id (most reliable)
REM ===================================================================

setlocal

set "SCRIPT_DIR=%~dp0"

if "%~1"=="" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%make-admin.ps1"
) else if /I "%~1"=="--id" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%make-admin.ps1" -UserId %~2
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%make-admin.ps1" -PhoneNumber "%~1"
)

echo.
pause
endlocal
