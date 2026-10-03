#!/bin/bash
# Double-click (macOS) or run (Linux) to send your saved level edits to GitHub.
# Commits only the course files (src/levels), runs the tests, then pushes.
REPO="https://github.com/DwindlingIntellect/Dunn-Clark-Challenge.git"
# Use the copy this script lives in (tools/ inside the project); otherwise ~/AshenSpire.
HERE="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$HERE/package.json" ] && [ -d "$HERE/src/levels" ]; then DIR="$HERE"; else DIR="$HOME/AshenSpire"; fi

fail() { echo; echo "$1"; read -r -p "Press Enter to close."; exit 1; }
command -v git >/dev/null || fail "Git is not installed. On macOS run: xcode-select --install"
command -v node >/dev/null || fail "Node.js is not installed. Download the LTS version from https://nodejs.org"
node -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)" || fail "Node.js 20 or newer is needed (https://nodejs.org)."

[ -d "$DIR/.git" ] || fail "No project found at $DIR. Run AshenSpire-Editor.command first."
cd "$DIR" || fail "Could not open $DIR"
git add src/levels
if git diff --cached --quiet; then echo "No saved level changes to publish."; read -r -p "Press Enter to close."; exit 0; fi
echo "These course files will be published:"
git diff --cached --stat
echo
echo "Running the tests ..."
if ! npm test; then
  read -r -p "Some tests failed. Publish anyway? [y/N] " yn
  case "$yn" in [Yy]*) ;; *) fail "Nothing was published. Your edits are still saved on this computer.";; esac
fi
# Git needs a name and email for the commit history; ask once and remember them for this project.
if ! git config user.email >/dev/null; then
  echo "Git needs a name and email to record who made the change. This is asked only once."
  read -r -p "Your name: " GN
  read -r -p "Your email: " GE
  git config user.name "$GN"
  git config user.email "$GE"
fi
read -r -p "Describe your change, or press Enter for 'Level edits': " MSG
git commit -m "${MSG:-Level edits}" || fail "Commit failed."
git pull --rebase --autostash || fail "Your edits clash with changes on GitHub. They are committed locally; ask Claude to help merge."
git push || fail "Push failed - check that you are signed in to GitHub. Your edits are committed locally."
echo
echo "Published. GitHub rebuilds the downloadable game in a minute or two."
read -r -p "Press Enter to close."
