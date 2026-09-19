@echo off
title AI Student Attendance System - 1-Click Launcher
echo ========================================================
echo   Starting AI Student Attendance System (GP Daman)
echo ========================================================
echo.

:: 1. Start FastAPI Backend Server
echo [1/3] Starting Python FastAPI Backend Server...
start "AI Attendance Backend" cmd /k "cd /d %~dp0backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: 2. Wait 3 seconds for server startup
timeout /t 3 /nobreak > nul

:: 3. Start Cloudflare HTTPS Tunnel for Mobile Access
echo [2/3] Starting Mobile Cloudflare HTTPS Tunnel...
start "Mobile Cloudflare Tunnel" cmd /k "cd /d %~dp0backend && npx cloudflared tunnel --url http://localhost:8000"

:: 4. Open Browser
echo [3/3] Opening Web App in Browser...
start http://localhost:8000/index.html

echo.
echo ========================================================
echo  SYSTEM IS NOW LIVE AND RUNNING!
echo  Keep the opened command prompt windows running.
echo ========================================================
