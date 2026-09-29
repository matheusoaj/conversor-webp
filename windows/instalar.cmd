@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Conversor WebP - instalação

echo.
echo   Conversor WebP para Windows
echo   ===========================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   O Node.js não está instalado neste computador.
  echo.
  echo   1. Baixe a versão LTS em https://nodejs.org
  echo   2. Instale com as opções padrão
  echo   3. Dê dois cliques neste arquivo de novo
  echo.
  pause
  exit /b 1
)

echo   [1/2] Baixando as bibliotecas (pode levar alguns minutos na primeira vez)...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto erro

echo.
echo   [2/2] Montando o instalador...
call npm run instalador --silent
if errorlevel 1 goto erro

echo.
echo   Pronto! Abrindo o instalador...
if not defined CONVERSOR_WEBP_NAO_ABRIR (
  for %%f in ("dist\*Instalador.exe") do start "" "%%~ff"
)
exit /b 0

:erro
echo.
echo   Algo deu errado. A mensagem acima explica o motivo.
if not defined CONVERSOR_WEBP_NAO_ABRIR pause
exit /b 1
