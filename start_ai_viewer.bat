@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] python was not found in PATH.
  pause
  exit /b 1
)

start "" http://127.0.0.1:8000/
python viewer_server.py
