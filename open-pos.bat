@echo off
title DreamyCafe POS (Kiosk)
cd /d "%~dp0"

echo Opening DreamyCafe kiosk (server + tunnel run as Windows services)...
cd desktop
if not exist node_modules (
  echo Installing desktop dependencies...
  call npm install
  if errorlevel 1 (
    echo DESKTOP INSTALL FAILED
    pause
    exit /b 1
  )
)
call npm start
