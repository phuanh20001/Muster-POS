@echo off
title DreamyCafe - Enable Windows Services (NSSM)
cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator - approve the UAC prompt...
  powershell -NoProfile -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c \"\"cd /d \"%~dp0\" ^&^& \"%~f0\"\"' -Wait"
  exit /b %errorlevel%
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\enable-windows-services.ps1"
echo.
pause
