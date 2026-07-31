@echo off
title DreamyCafe POS - Stop
cd /d "%~dp0"

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-pos.ps1"
echo.
pause
