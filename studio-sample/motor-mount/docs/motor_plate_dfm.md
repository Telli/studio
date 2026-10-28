# Motor plate: CNC machining review

The plate can be milled as drawn on a 3-axis mill in two setups. Every measured feature passes the cited rules; two items are left for review: the pilot bore's tolerance, and deburring the holes and slots, which no operation does.

## Scope

- Artifact: the plate's model, `parts/motor_plate.py`, reviewed on 2026-10-26, and its STEP (`parts/motor_plate.step`, from `exports.py`); one part, one solid; millimetres. The measurements and the CAM plan were run again on cadgen 0.8 on 2026-10-27 and read the same.
- Process: CNC milling, 3-axis, two setups (top, then turned over), from a 116 x 62 x 10 mm 6061-T6 blank, as the CAM job plans it (`cam/motor_plate.cam.json`).
- Tooling assumed: the CAM job's proposed tools: 10, 6 and 4 mm flat carbide end mills, a 6 mm spot drill, a 3.4 mm drill and a 6 mm 90° chamfer mill. No shop's specification was given.
- Evidence: exact B-rep measurements of the model (`checks/motor_plate_dfm_measure.md`, from `cadgen run checks/motor_plate_dfm_measure.py`) and the CAM plan's checks (`cam/motor_plate.cam.glb`).
- Rules: Protolabs Network (Hubs), "How to design parts for CNC machining", https://www.hubs.com/knowledge-base/how-design-parts-cnc-machining/, read 2026-10-26, its table of recommended and feasible values and its best practices. ISO 2768-1 for the general tolerance, from its table of linear tolerances, not re-read this session.

## Findings

| Part / feature | Evidence | Applicable rule | Result | Suggested action |
| --- | --- | --- | --- | --- |
| Pocket's inside corners | R5.000, 4 corners, measured; cut by the 6 mm end mill (R3) | Hubs, internal edges: vertical corner radius at least 1/3 of the cavity depth (3 mm: R1), and a little over the tool's radius (e.g. 1 mm) so it cuts round the corner | pass (R5 against R1, and 2 mm over the cutter's R3) | None |
| Pocket depth | 3.000 deep, 46 x 46 opening | Hubs, cavities: depth up to 4 times the width | pass (0.07 times) | None |
| Pocket floor to wall | Sharp, as a flat end mill leaves it | Hubs, floor radius: 0.5 mm, 1 mm or no radius | pass | None |
| Belt slots | 5.5 wide, R2.750 ends, 6 deep through; cut by the 4 mm end mill (R2) | Hubs, cavities: depth up to 4 times the width; internal edges as above | pass (1.1 times; ends R2.75 over the cutter's R2) | None |
| M3 clearance holes | Ø3.400, 3 deep through the floor, 4 | Hubs, holes: a standard drill diameter; depth up to 4 times the diameter | pass (3.4 mm is a standard drill; 0.9 times) | None |
| Pilot bore | Ø22.200, 3 deep through the floor; milled by a helix with the 6 mm end mill | Hubs, holes: a non-standard diameter is milled, under the cavity rules (pass); ISO 2768-m: ±0.2 mm from 6 to 30 mm | review | Under ISO 2768-m the bore may come out 22.0 to 22.4 mm, and the motor's 22 mm pilot can be a line-to-line fit at the low end. State a tolerance on the bore, such as Ø22.2 +0.1/0, once the bought motor's pilot is measured |
| Thinnest walls | 5.000 between the pocket and the plate's side (3 mm tall); 5.800 from an M3 hole to the pocket wall; 7.250 from a slot to the plate's end | Hubs, thin walls: at least 0.8 mm in metals | pass | None. The machining check (`parts/motor_plate.machining.result.json`) puts 0.000146 mm of deflection under the pocket wall's finishing cut |
| Setups | 2: top (every feature) and bottom (facing, the last 1 mm of the outline, the bottom chamfer) | Hubs, setups: up to three or four re-holds is acceptable; features that must be accurate to each other in one setup | pass: the bore, the M3 holes and the slots are all cut in the top setup | None |
| Tool access | Every hole, slot and the pocket open along +Z | Hubs: features along one of the six principal directions | pass | None |
| Outline edges | 0.5 x 45° chamfers top and bottom, cut by the chamfer mill; outside corners R5 | Hubs gives no rule for outside edges | pass (cut by the CAM job, both setups) | None |
| Hole and slot edges | Left sharp in the model; no operation breaks them | No cited rule | review | Deburr them by hand, as the drawing's note 3 says, or add a chamfer pass to the CAM job |

## Coverage

- Measured: every inside vertical corner, the pocket's depth and opening, every hole's and slot's diameter and depth, the thinnest walls between features, the setups and the approach directions.
- Checked by the CAM plan rather than by rule: the tools' reach and holder clearance, gouges, the vise's jaws (`cam/motor_plate.cam.json`, "Ready to cut").
- Not checked: the shop's own machine, tools and vise; the surface finish (none is specified); a quote or a cycle time beyond the CAM plan's estimate.
- No finding is a blanket approval: a shop's specification, when there is one, replaces the rules above.
