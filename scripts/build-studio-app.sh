#!/usr/bin/env bash
# Builds Studio as a Mac app, release/Studio-<version>-arm64.dmg, that runs on an Apple silicon Mac
# with nothing else installed: it carries the CAD tools with a Python of their own, and its first
# screen installs Claude Code and signs in. Unsigned, it is signed ad hoc, so the person opening it
# chooses Open Anyway once (System Settings, Privacy & Security).
#
# Run it from a checkout set up with scripts/setup-studio.sh, with Rust's cargo installed for the
# desktop build. It stages build/studio-bundle (the CAD tools' Python, their plugin and page, and
# studio.json), which the desktop build copies into the app's Resources/studio
# (scripts/lib/studio-app.ts) and which the app sets itself up from on each start
# (apps/desktop/src/studio/studioAppBundle.ts).
#
#   scripts/build-studio-app.sh [version]    (0.1.0 when left out)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAD="$ROOT/text-to-cad"
BUNDLE="$ROOT/build/studio-bundle"
VERSION="${1:-0.1.0}"
export PATH="$ROOT/node_modules/.bin:$HOME/.local/bin:$PATH"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
stop() {
  printf '\n\033[1mBuild stopped.\033[0m %s\n' "$1" >&2
  exit 1
}

[ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || stop "Build the Studio app on an Apple silicon Mac."
[ -x "$CAD/.venv/bin/python" ] && [ -x "$ROOT/node_modules/.bin/vp" ] ||
  stop "Set this checkout up first: scripts/setup-studio.sh"
command -v cargo >/dev/null 2>&1 || stop "The desktop build needs Rust's cargo: https://rustup.rs"
# Its resource monitor's dependencies need Rust 1.95 or newer.
rust="$(rustc --version 2>/dev/null | awk '{print $2}')"
rust_minor="$(printf '%s' "$rust" | cut -d. -f2)"
[ "${rust%%.*}" = 1 ] && [ "${rust_minor:-0}" -ge 95 ] ||
  stop "The desktop build needs Rust 1.95 or newer; this Mac has ${rust:-none}. Run rustup update stable, or install 1.95 and set RUSTUP_TOOLCHAIN=1.95."

step "Building the CAD tools' runtime and page"
(cd "$CAD" && scripts/bundle/bundle.sh && npm run build:mcp)

step "Making the CAD tools' own Python"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
uv python install 3.13
python="$(uv python find --managed-python 3.13)"
# uv's own CPython build moves with the folder it is in, so the app can carry it.
cp -R "$(cd "$(dirname "$python")/.." && pwd -P)" "$BUNDLE/python"
uv build --wheel --out-dir "$work" "$CAD/packages/cadgen"
wheel="$(ls "$work"/cadgen-*.whl)"
# The versions the checkout's CAD tools run on, so the app runs the same ones.
uv pip freeze --python "$CAD/.venv/bin/python" | grep -v -E '^-e |^cadgen|^ziglang' >"$work/constraints.txt"
uv pip install --python "$BUNDLE/python/bin/python3" --break-system-packages \
  -c "$work/constraints.txt" "cadgen[fea] @ file://$wheel"
"$BUNDLE/python/bin/python3" -c "import cadgen.mcp.server, OCP, netgen"
# The bundle carries no symlinks: copying it into the app turns relative links into links that
# point outside the app, which fails the app's signature check.
find "$BUNDLE" -type l | while IFS= read -r link; do
  cp -RL "$link" "$link.real" && mv -f "$link.real" "$link"
done

step "Laying out the CAD plugin"
"$BUNDLE/python/bin/python3" "$ROOT/scripts/studio-app-plugin.py" "$CAD" "$BUNDLE/marketplace"
mkdir -p "$BUNDLE/page"
cp "$CAD/apps/mcp/dist/index.html" "$BUNDLE/page/index.html"
cat >"$BUNDLE/studio.json" <<'JSON'
{
  "name": "Studio",
  "home": ".text-to-cad-studio",
  "profile": "studio",
  "plugins": ["text-to-cad"]
}
JSON

step "Building the app"
cd "$ROOT"
T3CODE_DESKTOP_STUDIO_BUNDLE="$BUNDLE" VITE_APP_BASE_NAME=Studio T3CODE_BRAND_DIR="$ROOT/brand" \
  node scripts/build-desktop-artifact.ts --platform mac --target dmg --arch arm64 --build-version "$VERSION"

printf '\n\033[1mStudio is built:\033[0m %s\n' "$ROOT/release/Studio-$VERSION-arm64.dmg"
