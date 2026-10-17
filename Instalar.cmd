@echo off
rem Instala o Codex de Criacao (dados do jogo + app + mod opcional)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" %*
pause
