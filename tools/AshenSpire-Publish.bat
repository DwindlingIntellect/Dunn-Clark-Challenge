@echo off
setlocal
title Ashen Spire - publish level edits
rem Double-click to send your saved level edits to GitHub.
rem Commits only the course files (src\levels), runs the tests, then pushes.
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
  echo No project found at %DIR%. Run AshenSpire-Editor.bat first.
  pause
  exit /b 1
)
cd /d "%DIR%"
git add src/levels
git diff --cached --quiet
if not errorlevel 1 (
  echo No saved level changes to publish.
  pause
  exit /b 0
)
echo These course files will be published:
git diff --cached --stat
echo.
echo Running the tests ...
call npm test
if errorlevel 1 (
  choice /c YN /m "Some tests failed. Publish anyway"
  if errorlevel 2 (
    echo Nothing was published. Your edits are still saved on this computer.
    pause
    exit /b 1
  )
)
rem Git needs a name and email for the commit history; ask once and remember them for this project.
set "GITEMAIL="
for /f "delims=" %%e in ('git config user.email 2^>nul') do set "GITEMAIL=%%e"
if defined GITEMAIL goto have_identity
echo Git needs a name and email to record who made the change. This is asked only once.
set /p "GN=Your name: "
set /p "GE=Your email: "
git config user.name "%GN%"
git config user.email "%GE%"
:have_identity
set "MSG="
set /p "MSG=Describe your change, or press Enter for 'Level edits': "
if not defined MSG set "MSG=Level edits"
git commit -m "%MSG%"
if errorlevel 1 (
  pause
  exit /b 1
)
git pull --rebase --autostash
if errorlevel 1 (
  echo Your edits clash with changes on GitHub. They are committed locally; ask Claude to help merge.
  pause
  exit /b 1
)
git push
if errorlevel 1 (
  echo Push failed - check that you are signed in to GitHub. Your edits are committed locally.
  pause
  exit /b 1
)
echo.
echo Published. GitHub rebuilds the downloadable game in a minute or two.
pause
