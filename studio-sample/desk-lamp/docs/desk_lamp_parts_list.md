# Desk lamp: parts list

The desk lamp (`assemblies/desk_lamp.step`) is eleven parts of eight kinds: four the project makes, the LED module, and six pieces of bought hardware. Two more things it needs are not in the model: the adhesive that holds the weight in the base, and the LED's driver and lead. The assembly drawing carries the same list with its balloons (`drawings/desk_lamp_drawing.pdf`, sheet 1).

## In the model

| Item | Part | How many | Material | How it is made, or where to buy it | File |
| --- | --- | --- | --- | --- | --- |
| 1 | Base | 1 | PETG | 3D printed (FDM) on a Bambu Lab printer, standing on its underside, with support only in the weight's pocket, which opens toward the bed. | `parts/base.step` |
| 2 | Weight | 1 | Mild steel | Sawn from Ø90 mm bar and faced to 10 mm, its edges chamfered 0.5 mm. Bonded into the base's pocket. | `parts/weight.step` |
| 3 | Socket head cap screw, ISO 4762, M5 × 30 | 2 | Steel, assumed: the step.parts file gives no material. Grade and finish not chosen. | Bought. Modelled from step.parts' `iso4762_socket_head_cap_screw_m5x30`. One is each hinge's pin. | `parts/imported/iso4762_socket_head_cap_screw_m5x30.step` |
| 4 | Nylon insert locknut, M5 | 2 | Steel with a nylon insert, assumed | Bought. Modelled from step.parts' `nylon_locknut_m5_simple`, a simplified 4 mm high nut; the screw stands 9.8 mm past the cheek, so it also goes right through a 5 mm high ISO 10511 M5 nut. | `parts/imported/nylon_locknut_m5_simple.step` |
| 5 | Arm | 1 | PETG | 3D printed (FDM), lying flat. | `parts/arm.step` |
| 6 | Head | 1 | PETG | 3D printed (FDM), its top on the bed, with support under the yoke. | `parts/head.step` |
| 7 | LED module | 1 | Aluminium-core LED board, assumed | Bought, not chosen: a Ø40 mm board with two M3 holes 32 mm apart and a COB emitter. step.parts has no LED module, so the model is a generic envelope from `parts/sizes.py`; check it against the board bought. | `parts/led_module.step` |
| 8 | Socket head cap screw, ISO 4762, M3 × 8 | 2 | Steel, assumed | Bought. Modelled from step.parts' `iso4762_socket_head_cap_screw_m3x8`. They cut their own thread in the head's Ø2.5 mm pilot holes. | `parts/imported/iso4762_socket_head_cap_screw_m3x8.step` |

## Not in the model

| Part | How many | Material | Where it comes from |
| --- | --- | --- | --- |
| Adhesive for the weight | As needed | Not chosen | Bonds the steel weight into the PETG base's pocket (the drawing's flag note 1). |
| LED driver, lead and plug | 1 | Not chosen | Powers the LED module. The lead runs along the arm's slot and into the head through a vent; nothing in the model holds it. |

## Masses

From the fit check's run (`assemblies/desk_lamp_fit.md`), the printed parts weighed solid at PETG's 1.27 g/cm³:

| Part | Mass (g) |
| --- | --- |
| Base | 186.2 |
| Weight | 498.8 |
| Arm | 31.4 |
| Head | 42.7 |
| LED module (as aluminium) | 5.8 |
| Hinge screws, each | 6.4 |
| Locknuts, each | 1.1 |
| LED screws, each | 0.9 |
| All | 781.7 |

## Open questions

- Which LED module: its board, its holes and its driver? The head's bosses and vents follow the envelope in `parts/sizes.py`.
- Which adhesive for steel in PETG?
- Which supplier for the screws and nuts, and which grade and finish?
- Washers under the hinge screws' heads and nuts, to spread the clamp on the PETG cheeks?
