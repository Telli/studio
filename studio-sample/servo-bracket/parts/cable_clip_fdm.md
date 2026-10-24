# Cable clip: FDM check

Two things to change before printing. The channel's lips narrow to a sharp edge, under FDM's 1.2 mm wall, and the exported STL has three open edges. Nothing needs supports, and the clip prints standing up as drawn.

## What was checked

- File: `parts/cable_clip.stl`, exported from `parts/cable_clip.step` with `cadgen stl build parts/cable_clip.step` at the default mesh tolerance.
- Measured with the dfam-check tool:
  - `python scripts/dfam_tool.py measure parts/cable_clip.stl --angle-limit 45`
  - `python scripts/dfam_tool.py orientations parts/cable_clip.stl --angle-limit 45`
- Print intent:
  - FDM in PETG at 0.2 mm layers, on a Bambu Lab P1S with a 0.4 mm nozzle.
  - No PETG or printer datasheet was given, so the limits are the FDM column of the skill's `references/process-limits.md`.
  - The P1S's build volume comes from Bambu Studio 02.05.00.66's "Bambu Lab P1S 0.4 nozzle" preset.
- Units: millimetres. The tool's `scale.units_suspect` is false, with a 13.72 mm bounding diagonal.

## Findings

| Status | Check | Measured | Limit | What to change |
| --- | --- | --- | --- | --- |
| ❌ fail | Watertight | `mesh.watertight` false, so `mesh.volume_mm3` is null. Three edges belong to one triangle each, all on the top face (z 4.0) along y 1.6, from x −2.263 to 4.0. One triangle's edge runs through the corner at x 2.263 instead of ending there. The surfaces meet with no gap: the STEP is a closed solid (cadgen `read_step`: valid, no free edges, 273.036 mm³). Exports at mesh tolerances 1e-3, 5e-4 and 2e-4, and as 3MF, have the same three edges. | Watertightness blocks slicing for every process (process-limits.md, Interpretation notes). | Nothing in the part. Repair the mesh before slicing, or export again once cadgen's mesh export closes it, then measure again. |
| ❌ fail | Wall thickness | `wall_thickness.p05_mm` 1.028 mm, `min_mm` 0.369 mm. The thinnest sample is 0.369 mm at [1.44, 7.70, −1.33]. All 38 of the tool's samples under 1.2 mm are on the channel's two lips, above y 5.5. There the opening's straight sides meet the round outside of the channel, and each lip narrows to a sharp edge. Elsewhere the base and the wall measure 1.6 mm (`p25_mm` 1.600, `median_mm` 1.604). | FDM min supported wall 1.2 mm. The lips stand free, so FDM's min unsupported wall, 1.6 mm, applies to them. | Round each lip's end so it keeps its wall to the tip: a full R0.8 round across the 1.6 mm wall, or cut the opening's sides radially. Thicken the channel wall from 1.6 to 2.0 mm (`WALL` in `cable_clip.py`) so the lips clear 1.6 mm with margin. Then export and measure again: p05 at least 1.2 mm, lips at least 1.6 mm. |
| ✅ pass | Overhangs and supports | `overhangs.down_facing_area_below_limit_mm2` 0.0 at 45°. No face points down anywhere off the plate (`down_facing_angle_histogram_mm2` is empty). `support_volume.estimated_support_volume_mm3` 0.0. | FDM self-supporting angle 45° from horizontal | None |
| ✅ pass | Bridges | Nothing faces down off the plate, so nothing bridges. | FDM max unsupported bridge 10 mm | None |
| ✅ pass | Build orientation | Upright as drawn (`current_plus_z`): 0 mm² of support and 8.0 mm tall. Turned over (`flip_180_x`): the same. On its side: 12.39 to 83.46 mm² of support. | Fewest supports at the least height | Print it standing up, channel vertical, as drawn. |
| ✅ pass | Bed fit | `mesh.bbox_mm` 8.0 × 7.76 × 8.0 | Bambu Lab P1S: 256 × 256 mm plate, 250 mm tall (Bambu Studio's P1S preset `printable_area`, `printable_height`) | None |
| ❓ need more info | Small holes | The tool does not measure holes (process-limits.md, What the tool measures today). The STEP's channel is a Ø4.0 mm cylinder, but its printed size is not measured. | FDM min hole diameter 2.0 mm | None needed to print. Check that the lead presses into the printed channel. |
| ❓ need more info | Small features | Not measured by the tool | FDM min positive feature 0.8 mm | None |

The support ratio's base is the mesh's convex hull, 432.8 mm³, because the open mesh has no volume of its own.

With the cad skill, both changes can go into `parts/cable_clip.py`: the clip is then built again, exported and measured until nothing fails.
