@echo off
REM DreamyCafe - double-click to deploy a code update to the live mini PC.
REM Self-elevates to Administrator, then runs scripts\deploy.ps1
REM (backup -> build -> restart -> health check; a failed build never restarts).

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator privileges...
  if "%*"=="" (
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  ) else (
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs -ArgumentList '%*'"
  )
  exit /b
)

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" %*
echo.
pause
