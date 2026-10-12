@echo off
setlocal
echo ========================================================
echo   DJ Player - Build Android APK
echo ========================================================
echo.

cd /d "%~dp0"

echo Step 1: Building mobile user interface...
cd mobile-web
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Web interface build failed!
    pause
    exit /b 1
)

echo Syncing assets to Android app...
if not exist "..\app\src\main\assets\public" mkdir "..\app\src\main\assets\public"
xcopy /E /I /Y "dist\*" "..\app\src\main\assets\public\" >nul
cd ..

echo.
echo Step 2: Checking Android SDK and Gradle...
if exist "gradlew.bat" (
    echo Attempting Gradle build...
    call gradlew.bat assembleDebug
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ========================================================
        echo   SUCCESS: APK generated successfully!
        echo   File: android\app\build\outputs\apk\debug\app-debug.apk
        echo ========================================================
        endlocal
        exit /b 0
    )
)

echo.
echo --------------------------------------------------------
echo   To compile the native .APK file:
echo   1. Open the "android" folder in Android Studio.
echo   2. Go to "Build" - "Build Bundle(s) / APK(s)" - "Build APK(s)".
echo   3. Output APK will be at:
echo      android\app\build\outputs\apk\debug\app-debug.apk
echo.
echo   OR use the instant PWA mobile version in any phone browser:
echo      http://^<YOUR-PC-IP^>:29888/mobile
echo --------------------------------------------------------
echo.
endlocal
