@echo off
title Zenve Vet AI Assistant (VetScribe - Ollama) (:8005)
echo ==============================================================================
echo  Starting Zenve Vet VetScribe AI Assistant Microservice on Port 8005
echo ==============================================================================
cd /d "%~dp0..\NLP-grammer-and-spell-checker-main"
python app.py
pause
