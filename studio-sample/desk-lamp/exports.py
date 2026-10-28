"""The project's delivered files, written from its models: the lamp's STEP (which its work instructions document) and
each made part's, and the printed parts as STL for the slicer. Run from the project root with `python exports.py` after
a change."""

import sys
from pathlib import Path

from cadgen import export

ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / "parts"), str(ROOT / "assemblies")]

from arm import arm  # noqa: E402
from base import base  # noqa: E402
from desk_lamp import desk_lamp  # noqa: E402
from head import head  # noqa: E402
from led_module import led_module  # noqa: E402
from weight import weight  # noqa: E402

if __name__ == "__main__":
    export(desk_lamp, ROOT / "assemblies/desk_lamp.step")
    export(base, ROOT / "parts/base.step", ROOT / "parts/base.stl")
    export(arm, ROOT / "parts/arm.step", ROOT / "parts/arm.stl")
    export(head, ROOT / "parts/head.step", ROOT / "parts/head.stl")
    export(weight, ROOT / "parts/weight.step")
    export(led_module, ROOT / "parts/led_module.step")
