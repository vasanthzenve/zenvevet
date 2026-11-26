@echo off
title Zenve Vet - Full Stack Launcher
echo ==============================================================================
echo  Zenve Vet(TM) Platform - Full Stack Launcher
echo ==============================================================================
echo.

:: 1. Check Ollama
echo [1/4] Checking Ollama Service...
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Ollama is not responding on http://127.0.0.1:11434
    echo Please make sure Ollama is started and llama3.2 is pulled.
) else (
    echo [OK] Ollama is running and responding.
)

:: 2. Start NLP AI Assistant Service on Port 8005
echo [2/4] Starting Zenve Vet NLP Case Assistant Service on Port 8005...
start "Zenve Vet - NLP AI Service (:8005)" cmd /k "cd /d "%~dp0NLP-grammer-and-spell-checker-main" && python app.py"

:: 3. Start Spring Boot Backend (Port 8080)
echo [3/4] Starting Spring Boot Backend (Node 1) on Port 8080...
start "Zenve Vet - Backend Node 1 (:8080)" cmd /k "cd /d "%~dp0server" && .\mvnw.cmd spring-boot:run"

:: 4. Start Vite Frontend (Port 5173)
echo [4/4] Starting Frontend Dev Server on Port 5173...
start "Zenve Vet - Frontend Client (:5173)" cmd /k "cd /d "%~dp0client" && npm run dev"

:: 5. Start API Gateway (Port 8000)
timeout /t 3 >nul
start "Zenve Vet - API Gateway (:8000)" cmd /k "cd /d "%~dp0" && node scripts/load-balancer.js"

echo.
echo ==============================================================================
echo [SUCCESS] All Zenve Vet services have been launched!
echo.
echo  - Web Application:       http://localhost:8000
echo  - Direct Frontend:       http://localhost:5173
echo  - API Gateway Status:    http://localhost:8000/lb-status
echo  - Spring Boot Backend:   http://localhost:8080/actuator/health
echo  - NLP AI Case Assistant: http://localhost:8005/health
echo  - Ollama Engine:         http://localhost:11434
echo ==============================================================================
echo.
pause
