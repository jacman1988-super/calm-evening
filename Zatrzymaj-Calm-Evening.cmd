@echo off
cd /d "%~dp0"
set "CALM_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%CALM_NODE%" set "CALM_NODE=node"
"%CALM_NODE%" desktop-launch.mjs --stop
if errorlevel 1 pause
