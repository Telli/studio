# Servo bracket: SendCutSend preflight

Ready to upload for this order: the cut file, in 0.080 in 5052-H32 with one bend. Nothing was uploaded, quoted or ordered.

## Context

- File: `cut/servo_bracket_cut.dxf`, the bracket's flat pattern with its bend line.
- Assumed service: DXF laser sheet cutting, with bending.
- Order:
  - Material: 5052 H32 Aluminum, SKU ALU-080, 0.080 in (2.03 mm), cut by fiber laser.
  - Bending: one 90° bend, on the BEND line.
  - Quantity 1. No finish, no hardware.
  - Tapping is not ordered. The four 2.5 mm holes are cut at the M3 × 0.5 tap drill size, to be tapped by hand after delivery.
- Date checked: 2026-10-23

## Sources checked

All read 2026-10-23.

- [sendcutsend-ordering-guide.md](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md)
- [sendcutsend-catalog.json](https://cdn.sendcutsend.com/specs/sendcutsend-catalog.json): `_meta.schema_version` 1.0, `_meta.generated_at` 2026-04-29T20:52:33.873247+00:00, `_meta.source_data_generated_at` 2026-04-29T13:28:32.522103
- [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json): the same `_meta` values
- [SendCutSend CNC bending](https://sendcutsend.com/services/cnc-bending/), reached from sendcutsend.com/guidelines/bending/: for the file rules the three files don't give

## Geometry facts

Read from the upload file with `ezdxf`, and checked with cadgen's `validate_dxf_file`.

- DXF AC1027. `$INSUNITS` 4 (millimetres), 1:1, extents 64.000 × 69.094 mm (2.52 × 2.72 in).
- Layers:
  - CUT: 8 lines, 8 arcs and 6 circles, all closed contours. The outline has R3 corners, the servo cutout is 41.5 × 20.6 mm with R0.5 corners, and there are four Ø2.5 mm and two Ø4.5 mm holes.
  - BEND: one line.
  - Both layers are colour 7 and linetype Continuous.
- No splines, text, dimensions, blocks, points or images. `validate_dxf_file`: no findings, so no open cut contours, duplicates or zero-length entities.
- Bend line: from (−32, 0) to (32, 0), 64.0 mm, edge to edge across the blank. One segment, the only bend.
- Local flange depth, from the bend line to the outline, sampled every 0.1 mm along it:
  - shelf side at least 36.31 mm (1.43 in), flange side at least 28.32 mm (1.11 in);
  - least at the R3 corners.
- Interior cuts nearest the bend line, reported apart from the flanges:
  - the servo cutout's edge, 10.547 mm (0.415 in) away on the shelf side;
  - the wall holes' edges, 12.297 mm (0.484 in) away on the flange side.
  - No cut lies within 6.0 mm of the bend line, and none touches it.
- Smallest hole Ø2.5 mm (0.098 in).
- Narrowest web: 1.725 mm (0.068 in), between each tapped hole and the cutout. The wall holes are 3.75 mm from the side edges.
- Tapped hole centres are 16.097 and 25.597 mm (0.634 and 1.008 in) from the bend line.
- The flat was developed for a 2.000 mm sheet with SendCutSend's 0.038 in inside radius and K-factor 0.48. That is a bend allowance of 3.024 mm.
  - Bent from 0.080 in stock, the shelf comes out 40.02 mm and the flange 32.02 mm outside, against the 40 and 32 mm drawn.

## Findings

| Status | Check | Evidence | Rule source | Recommendation |
| --- | --- | --- | --- | --- |
| ✅ pass | Units and scale | `$INSUNITS` 4, 1:1, 64.000 × 69.094 mm | [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), File Format Guidelines: DXF, "Set $INSUNITS correctly (1 = inches, 4 = mm)" | Choose MM in the "Confirm drawing units" dialog. |
| ✅ pass | Material and bending offered | ALU-080 `out_of_stock` false, `cutting_process` Fiber Laser, `available_services` includes `bending` | [sendcutsend-catalog.json](https://cdn.sendcutsend.com/specs/sendcutsend-catalog.json) `materials[sku=ALU-080]` | None |
| ✅ pass | Part size | 2.52 × 2.72 in flat | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].cutting_specs.min_part_size` 0.375x0.25, `max_part_size` 44 x 30; `bending_specs.min_flat_part_size` 0.375 x 1.5, `max_flat_part_size` 44 x 30 | None |
| ✅ pass | Cut contours | All closed. No duplicates, splines, text, dimensions or stray points. | [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), File Format Guidelines: DXF, "Use polylines and arcs, not splines"; [CNC bending](https://sendcutsend.com/services/cnc-bending/), Pre-flight checklist; direct file inspection (`validate_dxf_file`) | None |
| ✅ pass | Hole size | Smallest Ø2.5 mm (0.098 in) | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].cutting_specs.min_hole_size` 0.028; [CNC bending](https://sendcutsend.com/services/cnc-bending/), Pre-flight checklist: holes at least 50% of thickness (0.040 in) | None |
| ✅ pass | Webs between cuts | 1.725 mm (0.068 in), each tapped hole to the cutout | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].cutting_specs.min_bridge_size` 0.03 | None |
| ✅ pass | Hole to edge | 1.725 mm (0.068 in) at the least | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].cutting_specs.min_hole_to_edge` 0.024 | None |
| ✅ pass | Bend line layer | One solid line on its own layer, BEND, at the centre of the bend | [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), Bending: "Place bend lines on a dedicated layer (any name)" and "mark the center of each bend". The [CNC bending](https://sendcutsend.com/services/cnc-bending/) pre-flight list asks a 2D file for "all objects on the same layer" and "no open contours". The ordering guide speaks to bend lines and ranks above that page, so it settles this. | After upload, check that SendCutSend's 3D preview finds the bend. |
| ✅ pass | Bend line span | 64.0 mm, edge to edge of the blank | [ordering guide](https://cdn.sendcutsend.com/specs/sendcutsend-ordering-guide.md), Bending: bend lines "must extend completely across the area to be bent" | None |
| ✅ pass | Bend angle | One 90° bend, one segment (the angle from `parts/servo_bracket.step`) | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.max_bend_angle` 130 | Set 90° in the 3D preview. |
| ✅ pass | Bend length | 64.0 mm (2.52 in) | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.max_bend_length` 44.0 | None |
| ✅ pass | Flange length | At least 36.31 mm (shelf) and 28.32 mm (flange), bend line to outline, all along the bend | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.min_flange_length_before_bend` 0.255 and `min_flange_length_after_bend` 0.313 | None |
| ✅ pass | Cuts near the bend (source-limited) | The nearest cut is 10.547 mm (0.415 in) from the bend line. Nothing is within half the die width, 6.0 mm (0.236 in), and nothing touches the line. | Direct file inspection against [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.die_width` 0.472. SendCutSend gives no die-area rule for interior cuts. | None |
| ✅ pass | Bend radius and K-factor | Flat developed with an inside radius of 0.038 in and K 0.48. Outside sizes from 0.080 in stock: 40.02 and 32.02 mm, 0.02 mm over the 40 and 32 mm drawn. | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].bending_specs.effective_bend_radius` 0.038 and `k_factor` 0.48; [CNC bending](https://sendcutsend.com/services/cnc-bending/): "Design your parts using our specs", bend-to-edge tolerance ±0.015 in (0.38 mm) | None |
| ✅ pass | Thickness | The DXF carries none: 0.080 in is chosen in the configurator. The bracket is drawn 2.000 mm (0.0787 in) thick. | [sendcutsend-specs.json](https://cdn.sendcutsend.com/specs/sendcutsend-specs.json) `materials[sku=ALU-080].general_specs.thickness` 0.080, `thickness_tolerance_positive` and `_negative` 0.005 | None |

## Verdict

Ready to upload for this assumed context.

## Other choices

The STEP, `parts/servo_bracket.step`, is not ready. It is ❌ for a STEP upload.

- It is one solid, 2.000 mm thick, with a 0.965 mm inside bend radius.
- SendCutSend's [CNC bending](https://sendcutsend.com/services/cnc-bending/) pre-flight list asks 3D files to be "modeled at stock thickness with matching bend specs", and ALU-080 stock is 0.080 in (2.032 mm).
- To upload the STEP instead, set `THICKNESS = 2.032` in `parts/servo_bracket.py`. Then rebuild the bracket, its flat pattern, the cut file and the strength study.

SendCutSend could tap the four M3 holes instead, which is ❓.

- These pass: M3 × 0.5 is inside its tapping range (`tapping_specs.smallest_tap` M2 X 0.4, `largest_tap` 1/4-28).
- The holes meet its tapping distances:
  - `min_hole_cl_to_bend_line` 0.435 in: the holes are 0.634 in from the bend line;
  - `min_hole_to_edge` 0.024 in: the least is 0.068 in;
  - `min_flat_part_size` 0.949 x 1.5 in.
- Not known: none of the sources gives the hole size SendCutSend wants for an M3 tap. Confirm it in the configurator before adding tapping.
