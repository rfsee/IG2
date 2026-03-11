@echo off
setlocal
cd /d "%~dp0"

set "PORT=4173"
set "PYTHON_CMD="

where python >nul 2>nul && set "PYTHON_CMD=python"
if not defined PYTHON_CMD where py >nul 2>nul && set "PYTHON_CMD=py -3"

if not defined PYTHON_CMD (
  echo [ERROR] Cannot find Python. Install Python 3 first.
  pause
  exit /b 1
)

echo [INFO] Serving folder: %cd%
echo [INFO] URL: http://127.0.0.1:%PORT%/index.html
echo [INFO] Keep this window open. Press Ctrl+C to stop.
echo.

%PYTHON_CMD% -m http.server %PORT% --bind 127.0.0.1
