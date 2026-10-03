@echo off
setlocal
title Ashen Spire - level editor
rem Double-click to get (or update) the game and open the level editor in your browser.
rem Saving in the editor (Ctrl+S) only changes files on this computer.
rem Use AshenSpire-Publish.bat to send your level edits to GitHub.
set "REPO=https://github.com/DwindlingIntellect/Dunn-Clark-Challenge.git"
rem Use the copy this script lives in (tools\ inside the project); otherwise %USERPROFILE%\AshenSpire.
set "DIR=%~dp0.."
if exist "%DIR%\package.json" if exist "%DIR%\src\levels" goto have_dir
set "DIR=%USERPROFILE%\AshenSpire"
:have_dir
where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed. Download it from https://git-scm.com/download/win then run this again.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org then run this again.
  pause
  exit /b 1
)
node -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 20 or newer is needed. Update it from https://nodejs.org then run this again.
  pause
  exit /b 1
)

if not exist "%DIR%\.git" (
  echo Downloading the project into %DIR% ...
  git clone "%REPO%" "%DIR%"
  if errorlevel 1 (
    pause
    exit /b 1
  )
) else (
  echo Updating %DIR% from GitHub ...
  git -C "%DIR%" pull --rebase --autostash
  if errorlevel 1 echo Could not update automatically - continuing with your local copy.
)
cd /d "%DIR%"
echo Installing dependencies ...
call npm install --no-fund --no-audit
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Opening the editor in your browser. Keep this window open while you edit;
echo close it, or press Ctrl+C, to stop.
echo.
call npx vite --open "/?editor"
pause
