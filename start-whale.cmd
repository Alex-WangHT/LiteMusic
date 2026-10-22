@echo off
cd /d "%~dp0"
call npm run pet
if errorlevel 1 pause
