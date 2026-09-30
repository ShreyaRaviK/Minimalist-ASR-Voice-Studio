@echo off
title Vocalis ASR - Speech Recognition Studio
color 0b
echo ========================================================
echo   🎙️  Starting Vocalis ASR Speech Recognition Studio
echo ========================================================
echo.
cd /d "%~dp0"
python -m uvicorn local_server:app --host 127.0.0.1 --port 8000
pause
