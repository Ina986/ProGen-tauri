@echo off
setlocal

cd /d "%~dp0"

echo ============================================
echo  Starting ProGen...
echo ============================================
echo.

cd src-tauri
cargo run --release

set EXITCODE=%errorlevel%

if not "%EXITCODE%"=="0" (
    echo.
    echo ============================================
    echo  ProGen exited with error code: %EXITCODE%
    echo ============================================
    pause
)

endlocal
