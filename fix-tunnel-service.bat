@echo off
title DreamyCafe - Fix Tunnel Service
cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator - approve the UAC prompt...
  powershell -NoProfile -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c \"\"cd /d \"%~dp0\" ^&^& \"%~f0\"\"' -Wait"
  exit /b %errorlevel%
)

echo Fixing DreamyCafe tunnel service...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\fix-tunnel-service.ps1"
if errorlevel 1 (
  echo.
  echo FIX FAILED - see error above.
) else (
  echo.
  echo FIX SUCCEEDED.
)
echo.
pause
