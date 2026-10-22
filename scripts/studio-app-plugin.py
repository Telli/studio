#!/usr/bin/env python3
"""text-to-cad's plugin for the Studio app: a checkout's skills and CAD server, laid out as the
marketplace the packaged app carries (scripts/build-studio-app.sh).

The app's own Python runs the server and the skills' commands, but the app can live anywhere, so
its path is not known when the app is built. Every place that names it holds @@STUDIO_PYTHON@@,
with @@STUDIO_PAGE@@ for the server's page; the app fills them in on each start
(apps/desktop/src/studio/studioAppBundle.ts). cadgen's mesh and DXF builders need no Node of the
Mac's: cadgen runs them on the one Playwright ships in that Python.
The layout is the development plugin's (scripts/studio-dev-plugin.py), through the same
scripts/install/dev_install.py functions; its channel is "dev", as Studio's own is, which keeps
cadgen's update notices and telemetry off.

    python3 scripts/studio-app-plugin.py <text-to-cad checkout> <out folder>
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

PYTHON = "@@STUDIO_PYTHON@@"
PAGE = "@@STUDIO_PAGE@@"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2
    checkout = Path(argv[1]).resolve()
    out = Path(argv[2]).resolve()
    sys.path.insert(0, str(checkout / "scripts" / "install"))
    import dev_install

    # The development plugin's fix for skills that name an extra (FEA's cadgen[fea]==<VERSION>).
    spec = importlib.util.spec_from_file_location(
        "studio_dev_plugin", Path(__file__).resolve().parent / "studio-dev-plugin.py"
    )
    dev_plugin = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(dev_plugin)

    version = (checkout / "VERSION").read_text(encoding="utf-8").strip()
    name = dev_install.plugin_name(checkout)
    server = {
        "command": PYTHON,
        "args": ["-m", "cadgen.cli", "mcp"],
        "env": {"CADGEN_INSTALL_CHANNEL": "dev", "CADGEN_MCP_APP_DIR": PAGE},
        "startup_timeout_sec": dev_install.CODEX_STARTUP_SECONDS,
    }
    commands = {"cadgen": f"{PYTHON} -m cadgen.cli", "python": PYTHON}
    plugin = out / "plugins" / name
    dev_install.assemble("codex", plugin, version, server, root=checkout, commands=commands)
    dev_plugin.point_extras_at_checkout(dev_install, plugin, commands)
    dev_install.write_json(out / ".claude-plugin" / "marketplace.json", {
        "name": "studio-app",
        "owner": {"name": "Studio"},
        "description": f"{name} {version}, inside the Studio app",
        "plugins": [{"name": name, "source": f"./plugins/{name}", "version": version}],
    })
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
