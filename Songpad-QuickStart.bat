@echo off
rem Opens Songpad in its own window using Microsoft Edge or Chrome. Nothing to install.
set "APP=%~dp0www\index.html"
set "URL=file:///%APP:\=/%"
set "PROFILE=%LOCALAPPDATA%\Songpad"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app="%URL%" --user-data-dir="%PROFILE%"
  exit /b
)
if exist "%CHROME%" (
  start "" "%CHROME%" --app="%URL%" --user-data-dir="%PROFILE%"
  exit /b
)
start "" "%APP%"
