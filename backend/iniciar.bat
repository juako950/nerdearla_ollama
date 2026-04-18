@echo off
echo ========================================
echo   Iniciando API Ollama - Agente IA
echo ========================================
echo.

cd /d "%~dp0"

if exist "venv\Scripts\activate.bat" (
    echo Activando entorno virtual...
    call venv\Scripts\activate.bat
) else (
    echo [AVISO] No se encontro el entorno virtual. Usando Python del sistema.
)

echo Instalando dependencias...
pip install -r requirements.txt --quiet

echo.
echo Iniciando servidor en http://localhost:8000
echo Documentacion en http://localhost:8000/docs
echo.
echo Presiona Ctrl+C para detener el servidor.
echo.

uvicorn agente:aplicacion --reload --host 0.0.0.0 --port 8000
