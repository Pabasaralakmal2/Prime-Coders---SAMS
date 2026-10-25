@echo off
title SAM - Student Attendance Management System
echo ====================================================
echo  SAM - Student Attendance Management System
echo ====================================================

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Node.js is not installed on this computer!
  echo  Please download and install Node.js from:
  echo  https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo  Installing required packages... please wait...
  echo  (This only happens once)
  echo.
  call npm install
  echo.
  echo  Packages installed successfully!
  echo.
)

echo  Starting server and opening browser...
start http://localhost:8080
node sam/server.js

pause
