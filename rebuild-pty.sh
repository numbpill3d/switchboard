#!/usr/bin/env bash
# Rebuild node-pty against the installed Electron's ABI using the system node-gyp.
set -e
cd "$(dirname "$0")"
EV=$(node -p "require('./node_modules/electron/package.json').version")
echo "Rebuilding node-pty for Electron $EV ..."
export npm_config_runtime=electron
export npm_config_target="$EV"
export npm_config_disturl=https://electronjs.org/headers
export npm_config_arch=x64
export npm_config_build_from_source=true
cd node_modules/node-pty
HOME="$HOME/.electron-gyp" node-gyp rebuild \
  --target="$EV" \
  --arch=x64 \
  --dist-url=https://electronjs.org/headers
echo "node-pty rebuilt for Electron $EV"
