#!/bin/bash
# Double-click (macOS) or run (Linux) to get or update the game and open the
# level editor in your browser. Saving in the editor (Ctrl+S) only changes files
# on this computer; use AshenSpire-Publish.command to send edits to GitHub.
REPO="https://github.com/DwindlingIntellect/Dunn-Clark-Challenge.git"
# Use the copy this script lives in (tools/ inside the project); otherwise ~/AshenSpire.
HERE="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$HERE/package.json" ] && [ -d "$HERE/src/levels" ]; then DIR="$HERE"; else DIR="$HOME/AshenSpire"; fi

fail() { echo; echo "$1"; read -r -p "Press Enter to close."; exit 1; }
command -v git >/dev/null || fail "Git is not installed. On macOS run: xcode-select --install"
command -v node >/dev/null || fail "Node.js is not installed. Download the LTS version from https://nodejs.org"
node -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)" || fail "Node.js 20 or newer is needed (https://nodejs.org)."

if [ ! -d "$DIR/.git" ]; then
  echo "Downloading the project into $DIR ..."
  git clone "$REPO" "$DIR" || fail "Could not download the project."
else
  echo "Updating $DIR from GitHub ..."
  git -C "$DIR" pull --rebase --autostash || echo "Could not update automatically - continuing with your local copy."
fi
cd "$DIR" || fail "Could not open $DIR"
echo "Installing dependencies ..."
npm install --no-fund --no-audit || fail "npm install failed."
echo
echo "Opening the editor in your browser. Keep this window open while you edit;"
echo "close it, or press Ctrl+C, to stop."
echo
npx vite --open "/?editor"
