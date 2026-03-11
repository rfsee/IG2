@echo off
setlocal
cd /d "%~dp0"

set "PORT=4173"

echo Starting dashboard server window...
start "IG Dashboard Server" cmd /k ""%~dp0run-server.bat""

echo Opening dashboard page...
start "" cmd /c "timeout /t 2 /nobreak >nul && start \"\" \"http://127.0.0.1:%PORT%/index.html\""
