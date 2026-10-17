@echo off
rem Desliga o mod: o jogo volta a abrir 100%% original. Feche o jogo antes.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\mod-toggle.ps1" off
pause
