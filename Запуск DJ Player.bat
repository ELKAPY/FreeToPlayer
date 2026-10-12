@echo off
if exist "%~dp0FreeToPlayer.exe" (
    start "" "%~dp0FreeToPlayer.exe"
) else (
    start "" "%~dp0DJ-Player.exe"
)
