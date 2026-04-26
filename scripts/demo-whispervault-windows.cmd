@echo off
setlocal

echo Running WhisperVault demo reset...
call npm.cmd run demo:agent-vault:reset
if errorlevel 1 exit /b %errorlevel%

echo.
echo Running WhisperVault demo seed...
call npm.cmd run demo:agent-vault:seed
if errorlevel 1 exit /b %errorlevel%

echo.
echo Start app:
echo npm.cmd run dev
echo.
echo In another terminal:
echo npm.cmd run agent:coffee
echo npm.cmd run agent:coffee:reject
echo.
echo Open:
echo http://localhost:3000/
