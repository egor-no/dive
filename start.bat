@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)
echo Open http://localhost:4173 in your browser.
echo Keep this window open. Press Ctrl+C to stop.
node scripts/server.mjs
if errorlevel 1 pause
