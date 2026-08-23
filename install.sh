#!/usr/bin/env bash
# Switchboard installer — dependencies, native rebuild, desktop entry, icons.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
say(){ printf '\033[1m» %s\033[0m\n' "$*"; }

command -v node >/dev/null || { echo "node not found"; exit 1; }
command -v npm  >/dev/null || { echo "npm not found"; exit 1; }

say "Installing npm dependencies…"
npm install --no-audit --no-fund || true

# --- Ensure Electron binary is present (npm may block postinstall scripts) ---
EV=$(node -p "require('./node_modules/electron/package.json').version")
if [ ! -x "node_modules/electron/dist/electron" ]; then
  say "Fetching Electron $EV binary…"
  node node_modules/electron/install.js || true
  if [ ! -x "node_modules/electron/dist/electron" ]; then
    ZIP=$(find "$HOME/.cache/electron" -name "electron-v${EV}-linux-*.zip" 2>/dev/null | head -1)
    if [ -n "$ZIP" ]; then
      say "Extracting cached Electron zip…"
      rm -rf node_modules/electron/dist && mkdir -p node_modules/electron/dist
      unzip -q -o "$ZIP" -d node_modules/electron/dist
      printf electron > node_modules/electron/path.txt
    else
      echo "!! Could not obtain Electron binary. Install 'electron' via your package manager"
      echo "   and set the ELECTRON_OVERRIDE_DIST_PATH env var, or retry with network access."
    fi
  fi
fi

# --- Build node-pty against Electron's ABI ---
if [ ! -f "node_modules/node-pty/build/Release/pty.node" ] || \
   ! ./node_modules/electron/dist/electron --no-sandbox -e "require('node-pty')" 2>/dev/null; then
  say "Rebuilding node-pty for Electron $EV…"
  bash ./rebuild-pty.sh
fi

# --- Desktop entry + icons ---
say "Installing desktop entry and icons…"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor"
mkdir -p "$APPS"
EXEC="$DIR/node_modules/electron/dist/electron --no-sandbox --class=switchboard --ozone-platform-hint=auto $DIR"
sed "s#__EXEC__#$EXEC#" switchboard.desktop > "$APPS/switchboard.desktop"
chmod +x "$APPS/switchboard.desktop"
for s in 16 32 48 64 128 256; do
  if [ -f "assets/icon-$s.png" ]; then
    mkdir -p "$ICONS/${s}x${s}/apps"
    cp "assets/icon-$s.png" "$ICONS/${s}x${s}/apps/switchboard.png"
  fi
done
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f "$ICONS" 2>/dev/null || true

say "Done."
echo "  Launch from your app menu (Switchboard) or run:  npm start"
echo "  For a pinned desktop widget on KDE Wayland, see README.md (KWin rules)."
