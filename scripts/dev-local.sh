#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  boxable_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [ -x "$boxable_runtime/node" ]; then
    PATH="$boxable_runtime:$PATH"
    export PATH
  else
    echo "Boxable needs Node.js 24 (see .nvmrc). Install it, then run npm run dev again." >&2
    exit 1
  fi
fi
exec node frontend/node_modules/vite/bin/vite.js frontend --config frontend/vite.config.ts "$@"
