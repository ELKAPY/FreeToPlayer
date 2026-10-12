@echo off
setlocal
echo ========================================================
echo   DJ Player - Build Mobile Version (Android / Web)
echo ========================================================
echo.

cd /d "%~dp0mobile-web"
echo Step 1: Installing dependencies...
call npm install --prefer-offline --no-audit --no-fund

echo Step 2: Compiling mobile bundle...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo Step 3: Copying assets to Android app...
if not exist "..\app\src\main\assets\public" mkdir "..\app\src\main\assets\public"
xcopy /E /I /Y "dist\*" "..\app\src\main\assets\public\" >nul

echo.
echo ========================================================
echo   SUCCESS: Mobile version built successfully!
echo   Web / PWA:    android\mobile-web\dist
echo   Android App:  android\app\src\main\assets\public
echo ========================================================
echo.
endlocal
