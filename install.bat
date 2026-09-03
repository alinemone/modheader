@echo off
rem OpenModHeader installer for Windows. Double-click to run.
rem
rem Chrome does not allow an extension to be installed by a script. This does
rem the tedious part: fetch the latest release, unpack it somewhere stable,
rem and put that path on the clipboard so the last step is a paste.

setlocal
set "REPO=alinemone/modheader"
set "URL=https://github.com/%REPO%/releases/latest/download/openmodheader.zip"
set "DEST=%LOCALAPPDATA%\OpenModHeader"
set "HERE=%~dp0"

if exist "%HERE%manifest.json" (
  echo Installing from local checkout: %HERE%
  if exist "%DEST%" rmdir /s /q "%DEST%"
  mkdir "%DEST%" || goto :fail
  copy /y "%HERE%manifest.json" "%DEST%\" >nul || goto :fail
  xcopy /e /i /q /y "%HERE%src" "%DEST%\src" >nul || goto :fail
  xcopy /e /i /q /y "%HERE%icons" "%DEST%\icons" >nul || goto :fail
  if exist "%HERE%README.md" copy /y "%HERE%README.md" "%DEST%\" >nul
  if exist "%HERE%LICENSE" copy /y "%HERE%LICENSE" "%DEST%\" >nul
) else (
  echo Downloading the latest release...
  if exist "%DEST%" rmdir /s /q "%DEST%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop';" ^
    "$zip = Join-Path $env:TEMP 'openmodheader.zip';" ^
    "try { Invoke-WebRequest -Uri '%URL%' -OutFile $zip -UseBasicParsing }" ^
    "catch { Write-Host 'Error: download failed. Check https://github.com/%REPO%/releases'; exit 1 };" ^
    "Expand-Archive -LiteralPath $zip -DestinationPath '%DEST%' -Force;" ^
    "Remove-Item $zip -Force" || goto :fail
)

if not exist "%DEST%\manifest.json" goto :fail

for /f "usebackq tokens=*" %%v in (`powershell -NoProfile -Command ^
  "(Get-Content -Raw '%DEST%\manifest.json' | ConvertFrom-Json).version"`) do set "VERSION=%%v"

echo|set /p="%DEST%"|clip

echo.
echo   OpenModHeader %VERSION% unpacked to:
echo.
echo       %DEST%
echo.
echo   Chrome cannot be scripted into installing this, so three steps are left:
echo.
echo     1. Open  chrome://extensions
echo     2. Turn on "Developer mode" (top right)
echo     3. Click "Load unpacked" and choose the folder above
echo        (the path is on your clipboard - just paste it)
echo.
pause
exit /b 0

:fail
echo.
echo   Install failed.
echo.
pause
exit /b 1
