@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\start-watchdog.ps1"
endlocal