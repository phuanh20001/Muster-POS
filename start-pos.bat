@echo off
cd /d "%~dp0"

rem Relaunch hidden so no console window stays open (Electron splash is the only UI).
rem The "hidden" arg is set by start-pos-hidden.vbs to avoid relaunch loop.
if /i not "%~1"=="hidden" (
  wscript.exe "%~dp0start-pos-hidden.vbs"
  exit /b
)

title DreamyCafe POS (Production)

rem Running hidden: no console to read, so log output and exit (never pause) on failure.
if not exist logs mkdir logs

call npm run build > logs\startup.log 2>&1
if errorlevel 1 (
  echo BUILD FAILED - see logs\startup.log >> logs\startup.log
  exit /b 1
)

cd desktop
if not exist node_modules (
  call npm install >> ..\logs\startup.log 2>&1
  if errorlevel 1 (
    echo DESKTOP INSTALL FAILED - see logs\startup.log >> ..\logs\startup.log
    exit /b 1
  )
)
cd ..

cd desktop
call npm start
