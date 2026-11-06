#!/usr/bin/env python3
"""How much of a new Studio an update downloads: two of electron-builder's blockmaps, compared as electron-updater
compares them (`computeOperations` in its differential downloader). A block of the new file whose checksum and size
the old file has is copied from the app on disk; every other block is downloaded.

    python3 scripts/studio-update-size.py <old>.blockmap <new>.blockmap

The Mac update is the zip's blockmap, Windows's the installer's. The first update after a DMG install is whole
whatever this says: `MacUpdater` has no cached zip to copy from. A blockmap is gzipped JSON, its files naming each
block's checksum and size. Only the first file counts, as in electron-updater.
"""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

MB = 1_000_000


def blocks_of(path: Path) -> tuple[str, list[str], list[int]]:
    """A blockmap's first file: its name, and its blocks' checksums and sizes in order."""
    with gzip.open(path, "rt", encoding="utf-8") as blockmap:
        first = json.load(blockmap)["files"][0]
    if len(first["checksums"]) != len(first["sizes"]):
        raise ValueError(f"{path.name} names {len(first['checksums'])} checksums and {len(first['sizes'])} sizes")
    return first["name"], first["checksums"], first["sizes"]


def update_size(old: Path, new: Path) -> dict[str, int]:
    """The new file's total size, what an update downloads of it, and in how many blocks."""
    old_name, old_checksums, old_sizes = blocks_of(old)
    new_name, new_checksums, new_sizes = blocks_of(new)
    if old_name != new_name:
        # electron-updater refuses this, and falls back to the whole file.
        raise ValueError(f"the blockmaps name different files: {old_name} and {new_name}")
    # The first of a checksum's blocks stands for the rest, as in electron-updater's map.
    have: dict[str, int] = {}
    for checksum, size in zip(old_checksums, old_sizes):
        have.setdefault(checksum, size)
    changed = [size for checksum, size in zip(new_checksums, new_sizes) if have.get(checksum) != size]
    return {"total": sum(new_sizes), "download": sum(changed), "blocks": len(new_sizes), "changed": len(changed)}


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: python3 scripts/studio-update-size.py <old>.blockmap <new>.blockmap", file=sys.stderr)
        return 2
    size = update_size(Path(argv[1]), Path(argv[2]))
    share = 100 * size["download"] / size["total"] if size["total"] else 0.0
    print(f"{size['download'] / MB:.0f} of {size['total'] / MB:.0f} MB ({share:.1f}%), "
          f"{size['changed']} of {size['blocks']} blocks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
