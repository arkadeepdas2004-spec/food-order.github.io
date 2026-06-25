@echo off
title FreshBite Food Ordering App
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not available in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

echo Starting FreshBite...
echo Keep this window open while using the app.
start "" "http://localhost:3000"
node server.js

echo.
echo The server stopped. Review any error shown above.
pause
