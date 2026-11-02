#!/usr/bin/env python3
"""text-to-cad's plugin for the Studio app: a checkout's skills and CAD server, laid out as the
marketplace the packaged app carries (scripts/build-studio-app.sh).

The app's own Python runs the server, but the app can live anywhere, so its path is not known when
the app is built. Every place that names it holds @@STUDIO_PYTHON@@, with @@STUDIO_PAGE@@ for the
server's page and @@STUDIO_BIN@@ for the folder of Studio's `cad` command; the app fills them in on
each start (apps/desktop/src/studio/studioAppBundle.ts), and registers that Python's CAD server in
Studio's own CAD state there. The skills name no version: they run `cad`, the current installation,
which is that one. The plugin's MCP server is `cad-mcp` run by that Python, which reaches the
server it carries (`cad_mcp.engine`). The layout is a development install's
(scripts/install/dev_install.py); its channel is "dev", as Studio's own is, which keeps the CAD
server's update notices and telemetry off.

    python3 scripts/studio-app-plugin.py <text-to-cad checkout> <out folder>
"""

from __future__ import annotations

import sys
from pathlib import Path

PYTHON = "@@STUDIO_PYTHON@@"
PAGE = "@@STUDIO_PAGE@@"
BIN = "@@STUDIO_BIN@@"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2
    checkout = Path(argv[1]).resolve()
    out = Path(argv[2]).resolve()
    sys.path.insert(0, str(checkout / "scripts" / "install"))
    import dev_install

    version = (checkout / "VERSION").read_text(encoding="utf-8").strip()
    name = dev_install.plugin_name(checkout)
    server = {
        "command": PYTHON,
        "args": ["-m", "cad_mcp"],
        "env": {**dev_install.CHANNEL, "CAD_MCP_APP_DIR": PAGE},
        "startup_timeout_sec": dev_install.CODEX_STARTUP_SECONDS,
    }
    # `~/.local/bin/cad` is Studio's own, and the installer is the app's to run, never a skill's.
    note = "This is Studio's own install of the CAD tools; do not run the install command here"
    rewrites = {
        dev_install.INSTALL_COMMANDS[0]: f"# {note}",
        dev_install.INSTALL_COMMANDS[1]: note,
        "~/.local/bin": BIN,
    }
    plugin = out / "plugins" / name
    dev_install.assemble("codex", plugin, version, server, root=checkout, rewrites=rewrites)
    dev_install.write_json(out / ".claude-plugin" / "marketplace.json", {
        "name": "studio-app",
        "owner": {"name": "Studio"},
        "description": f"{name} {version}, inside the Studio app",
        "plugins": [{"name": name, "source": f"./plugins/{name}", "version": version}],
    })
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
