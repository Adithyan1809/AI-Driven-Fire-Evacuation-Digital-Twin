@echo off
cd /d "%~dp0"

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    pause
    exit /b 1
)

:: Launch the native desktop application via Electron
call npm run app

:: Fallback if electron fails
if %errorlevel% neq 0 (
    start "" powershell -WindowStyle Hidden -Command "node server.js"
    timeout /t 2 /nobreak >nul
    start msedge.exe --app="http://localhost:8080"
)
