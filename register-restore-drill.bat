@echo off
title DreamyCafe - Register Quarterly Restore Drill
cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator - approve the UAC prompt...
  powershell -NoProfile -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c \"\"cd /d \"%~dp0\" ^&^& \"%~f0\"\"' -Wait"
  exit /b %errorlevel%
)

echo Registering quarterly restore drill task...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\register-restore-drill-task.ps1"
if errorlevel 1 (
  echo.
  echo FAILED - see error above.
) else (
  echo.
  echo SUCCEEDED.
)
echo.
pause
