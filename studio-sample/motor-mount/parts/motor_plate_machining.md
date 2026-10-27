# Motor plate: machining check

Ready to cut: the pocket wall's finishing pass moves the wall 0.000146 mm, against ±0.05 mm, and does not chatter at 10,000 rpm. Checked with `cadgen manufacturing check parts/motor_plate.step --study parts/motor_plate.machining.json --fail-on error` (exit 0); the result is `parts/motor_plate.machining.glb` and every number is in `parts/motor_plate.machining.result.json`.

## The cut

The finishing pass round the weight-saving pocket, as the CAM job cuts it (`cam/motor_plate.cam.json`, operation 2): the 6 mm 3-flute carbide end mill (T2) at 10,000 rpm and 1,225 mm/min, 0.041 mm a tooth, climb milling, 3 mm deep (the whole wall) and 0.2 mm wide (the pocket's `finish_mm`). It was put on the pocket's +Y wall (`#o1.1.f45`), the wall nearest the plate's side, 5 mm thick. The plate is held by its two long sides (`#o1.1.f1`, `#o1.1.f47`), where the vise's jaws are.

## Checklist

| Check | Measured | Limit | Result |
| --- | --- | --- | --- |
| Deflection under the cut | 0.000146 mm, at (-2.99, 23.0, 6.0) mm, the top of the wall | ±0.05 mm (ISO 2768-1 fine, cadgen's default: no tolerance was given) | PASS |
| Stress from the cut | 0.721 MPa | 138 MPa (276 MPa yield over a margin of 2): a safety factor of 383 | PASS |
| Chatter at 10,000 rpm | 3 mm deep | no stability lobe under 75 mm | PASS |

- The force: 101 N along the cut and 64.7 N into the wall, from Kienzle's k_c1.1 800 N/mm² and m_c 0.25 for hardenable wrought aluminium, k_c 2,724 N/mm² at a 0.0074 mm chip.
- The clamped plate's lowest mode rings at 8,690 Hz; the mode that moves the wall most, mode 6, at 18,140 Hz with 5.28 x 10⁷ N/mm along its normal. The teeth pass at 500 Hz, far below.
- Mesh: 8,282 quadratic tetrahedra at 3.09 mm, solved with CalculiX 2.23.

## What it leaves out

The check is lite, and says so:

- The cutting force is Kienzle's for a sharp tool with straight flutes, no run-out or wear: a real tool and grade can differ by 20 % or more.
- Only the plate flexes: the tool, holder and spindle are rigid. A 6 mm end mill 20 mm out of its holder may chatter on its own, which this does not see.
- The cutter is put where the wall gives most, and only the force square to the wall acts.
- Chatter is the averaged, one-direction solution; the damping is the default 2 %, not measured (a tap test on the clamped plate measures it).
- The plate is checked as finished. In the top setup it is still part of the 116 x 62 x 10 mm blank, which is stiffer than this.
