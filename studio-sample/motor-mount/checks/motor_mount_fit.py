"""Checks the saved motor mount for collisions between its parts and measures where the motor and screws sit on the
plate. Run from the project root after `python assemblies/motor_mount.py`; writes checks/motor_mount_fit.md."""

from itertools import combinations
from pathlib import Path

from cadgen import read_scene
from cadgen.geometry import overlap_volume

ROOT = Path(__file__).resolve().parent.parent
scene = read_scene(ROOT / "assemblies" / "motor_mount.step")

parts = {}
for occ in scene.leaves():
    (selection,) = scene.resolve(occ.ref)
    parts[occ.label] = selection.shape()

lines = ["# Motor mount: fit check", "",
         "Measured on `assemblies/motor_mount.step` with `python checks/motor_mount_fit.py`. Millimetres; the plate's "
         "underside is Z 0.", "", "## Overlaps between parts", "", "| Parts | Overlap, mm3 | Result |", "| --- | --- | --- |"]
bad = 0
for (a, sa), (b, sb) in combinations(parts.items(), 2):
    v = sum(overlap_volume(x, y) for x in sa.solids() for y in sb.solids())
    if v > 1e-6:
        bad += 1
    lines.append(f"| {a} / {b} | {v:.4f} | {'pass' if v <= 1e-6 else 'FAIL'} |")

lines += ["", "## Where the parts sit", "", "| Part | Z min | Z max |", "| --- | --- | --- |"]
for name, shape in parts.items():
    bb = shape.bounding_box()
    lines.append(f"| {name} | {bb.min.Z:.3f} | {bb.max.Z:.3f} |")
lines += ["", f"{bad} overlapping pairs of {len(list(combinations(parts, 2)))}."]
(ROOT / "checks" / "motor_mount_fit.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
