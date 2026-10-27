#!/usr/bin/env python3
"""text-to-cad's development plugin for Studio: a checkout's working copy, not the release.

Studio reads a text-to-cad checkout as a marketplace, and that plugin runs the released cadgen
(`uvx --from cadgen==<VERSION>`), so work on a branch (FEA, CAM, KiCad) never reaches it. With
TEXT_TO_CAD_DEV=1, scripts/studio.ts runs this first. It lays the plugin out the way the checkout's
own scripts/install/dev_install.py lays one out for Codex, through that script's functions: the
checkout's .venv registered as this install's version (`<version>-dev.<time>`) and the `cadgen`
command written, both in Studio's own cadgen state (scripts/studio.ts sets CADGEN_STATE_DIR and
CADGEN_LAUNCHER_DIR before it runs this), the skills' `cadgen +<version>` pointed at that version,
and `cadgen mcp` run by that .venv, serving a fresh build of apps/mcp. The result is a marketplace
at <checkout>/tmp/studio-dev, which Studio uses in place, and its path is the one line printed.

Needs the checkout set up as CONTRIBUTING.md says: `.venv` from requirements-dev.txt (add
`-e "./packages/cadgen[fea]"` for FEA), `npm ci`, and `scripts/bundle/bundle.sh`.

    python3 scripts/studio-dev-plugin.py <text-to-cad checkout>
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


def point_launches_at(dev_install, plugin: Path, version: str) -> None:
    """A launch left naming a release through uvx -- one with an extra (FEA's `--from
    "cadgen[fea]==<VERSION>"`), or the pinned release a skill has not moved to `cadgen +<VERSION>` yet --
    which `rewrites=` does not reach and would fetch that release, runs this install too: `cadgen
    +<version>` (its `cadgen run` for `python`), as every 0.8 skill runs it. Its extras are this
    installation's own."""
    launcher = re.escape(" ".join(dev_install.LAUNCHER))
    pattern = re.compile(rf'{launcher} "?cadgen(?:\[[A-Za-z0-9_,-]+\])?==[0-9][0-9A-Za-z.+_-]*"? (cadgen|python)\b')
    ours = {"cadgen": f"cadgen +{version}", "python": f"cadgen +{version} run"}
    for skill in plugin.glob("skills/**/*.md"):
        text = skill.read_text(encoding="utf-8")
        rewritten = pattern.sub(lambda match: ours[match.group(1)], text)
        if rewritten != text:
            skill.write_text(rewritten, encoding="utf-8")


class Options:
    """dev_install's arguments: the checkout's .venv, with the page built fresh."""

    wheel = False
    build = True


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2
    checkout = Path(argv[1]).resolve()
    sys.path.insert(0, str(checkout / "scripts" / "install"))
    try:
        import dev_install
    except ImportError:
        print(f"{checkout} has no scripts/install/dev_install.py to build a dev plugin with.", file=sys.stderr)
        return 1
    try:
        version = dev_install.dev_version()
        # Registers the .venv as `version` in Studio's state and writes the `cadgen` command.
        server, rewrites, _ = dev_install.runtime("studio", Options, version)
        name = dev_install.plugin_name()
        root = dev_install.dev_root("studio")
        # Codex's layout: its manifest carries the plugin's icon and starter prompts.
        plugin = root / "plugins" / name
        dev_install.assemble("codex", plugin, version, server, rewrites=rewrites)
        point_launches_at(dev_install, plugin, version)
        dev_install.write_json(root / ".claude-plugin" / "marketplace.json", {
            "name": "text-to-cad-studio-dev",
            "owner": {"name": "this checkout"},
            "description": f"{name} from {checkout}, for Studio",
            "plugins": [{"name": name, "source": f"./plugins/{name}", "version": version}],
        })
    except dev_install.Refused as refused:
        print(refused, file=sys.stderr)
        return 1
    print(root)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
