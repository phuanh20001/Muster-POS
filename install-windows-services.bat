@echo off
title DreamyCafe - Install Windows Services
cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator - approve the UAC prompt...
  rem %* is forwarded through the elevation, or -AppOnly would be silently dropped and the
  rem elevated run would try to install the tunnel and fail on the missing cloudflared config.
  powershell -NoProfile -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c \"\"cd /d \"%~dp0\" ^&^& \"%~f0\" %*\"\"' -Wait"
  exit /b %errorlevel%
)

rem Pass -AppOnly to install just the POS server and skip the Cloudflare tunnel
rem (no domain yet). Any args given here are forwarded to the script.
echo Installing DreamyCafe Windows services... %*
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-windows-services.ps1" %*
if errorlevel 1 (
  echo.
  echo INSTALL FAILED - see error above.
) else (
  echo.
  echo INSTALL SUCCEEDED.
)
echo.
pause
