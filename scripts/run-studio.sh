#!/usr/bin/env bash
# Starts Studio from this checkout, once scripts/setup-studio.sh has set it up: the app, with the
# CAD plugin from text-to-cad/ here. Studio runs while this window stays open; Ctrl-C quits it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:$HOME/.local/bin:$PATH"
if [ ! -x node_modules/.bin/vpr ] || [ ! -x text-to-cad/.venv/bin/python ]; then
  echo "Studio isn't set up yet. Run scripts/setup-studio.sh first." >&2
  exit 1
fi
TEXT_TO_CAD_DEV=1 exec vpr studio:desktop
