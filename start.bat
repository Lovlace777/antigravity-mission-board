@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 22.5+ is required. Please install Node.js 22 LTS from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo [setup] Installing server dependencies...
  call npm --prefix server install
  if errorlevel 1 exit /b 1
)

if not exist "web\node_modules" (
  echo [setup] Installing web dependencies...
  call npm --prefix web install
  if errorlevel 1 exit /b 1
)

if not exist "server\dist\server\src\index.js" (
  echo [build] Building server...
  call npm --prefix server run build
  if errorlevel 1 exit /b 1
)

if not exist "web\dist\index.html" (
  echo [build] Building frontend...
  call npm --prefix web run build
  if errorlevel 1 exit /b 1
)

set "PORT_NUM=%PORT%"
if "%PORT_NUM%"=="" set "PORT_NUM=3777"
set "URL=http://127.0.0.1:%PORT_NUM%"

echo Starting Antigravity Mission Board at %URL% ...
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul && start "" %URL%"

node --no-warnings=ExperimentalWarning server\dist\server\src\index.js %*
