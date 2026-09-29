@echo off
setlocal
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\..\Conversor WebP.exe" "%~dp0..\app.asar\src\cli\webpify.js" %*
exit /b %ERRORLEVEL%
