@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
    echo [dev.bat] node_modules not found. Running npm install...
    call npm install
    if errorlevel 1 (
        echo [dev.bat] npm install failed.
        pause
        exit /b 1
    )
)

echo ============================================
echo  Starting ProGen (dev mode with HMR)...
echo ============================================
echo.

call npx tauri dev
if errorlevel 1 (
    echo.
    echo [dev.bat] tauri dev exited with an error.
    pause
)

endlocal
