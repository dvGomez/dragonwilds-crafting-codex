@echo off
rem Liga o mod ao vivo (UE4SS + CraftCodex). Feche o jogo antes.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\mod-toggle.ps1" on
pause
