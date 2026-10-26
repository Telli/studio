# Servo mount: test plan

Seven tests for the first servo mount (`assemblies/servo_mount.step`), from a real servo before the bracket is ordered to the 20 N load at the horn. They prove what the models could not: the servo's real sizes, the bent and tapped sheet, the fit, the horn's travel, the clip and the strength.

## What it must do

- Hold an MG996R servo horn up, by its four tab holes.
- Hold 20 N down at the servo horn. The strength study gives a safety factor of 3.66 against yield (`docs/servo_bracket_strength_report.md`).
- Let the horn turn its whole 120°, 60° each way, without touching anything.
- Fix to a wall with two M4 screws.

## Equipment

- Calipers, and a protractor or a square for the bend.
- An M3 × 8 screw and a 2.5 mm hex key.
- A servo tester or controller, and a 4.8 V supply.
- A rigid, flat test plate with two M4 holes 52 mm apart, a plate that bolts to the adapter's four M3 holes with a hook on the horn's axis, a 2.04 kg weight (20 N), and a dial indicator on a stand.

## Tests

| # | What to test | How | Pass criteria |
| --- | --- | --- | --- |
| 1 | The servo's real sizes, before the bracket is ordered | Measure an MG996R with calipers: the tab holes' size, their spacing along the servo (47.45 mm assumed) and across each tab (9.5 mm), the output axis from the end of the case (10.5 mm), the case (40.9 × 20.0 mm) and the spline (5.9 mm across its teeth). Write the values into `parts/sizes.py` if they differ, and rebuild. | The bracket in the model fits the measured servo: no collision in the fit check, and each M3 screw still clears its tab hole. |
| 2 | The bracket against its drawing | Measure the delivered bracket against `drawings/servo_bracket_drawing.pdf`: 64 × 40 × 32 mm overall, the holes 47.45 and 9.5 mm apart, the cutout 41.5 × 20.6 mm, the wall holes 52 mm apart, and the bend. Look along the outside of the bend. | Within the drawing's tolerances: cuts ±0.127 mm, bend to edge ±0.381 mm, the bend 90° ±1°. No crack on the outside of the bend. |
| 3 | The tapped holes | After tapping, run the M3 × 8 screw into each of the four holes by hand, then look at the 1.725 mm web between each hole and the cutout. | The screw runs fully in by hand in every hole. No web bulges or cracks. |
| 4 | The fit | Assemble the mount as `docs/servo_mount_assembly_instructions.md` says. | The case drops into the cutout without force and the tabs sit flat on the shelf. All four screws go in square. The adapter seats on the top of the spline with a gap all round above the case (1.7 mm in the model). |
| 5 | The horn's travel | Drive the servo from one end of its travel to the other and back, three times. | It reaches 60° each way. The adapter touches nothing and rubs nowhere. The lead stays in its clip. |
| 6 | Strength: 20 N at the horn | Bolt the bracket to the test plate by its two M4 holes, the flange's back flat on it. Zero the dial indicator under the shelf's front corner at the servo's output end, where the study moves most. Hang the 2.04 kg weight from the plate on the adapter, on the horn's axis, for a minute, then take it off. | No permanent set: the indicator comes back to zero. No screw loosens, and nothing cracks. Write down the deflection under load beside the study's 0.141 mm, which takes the wall and the screws as rigid. |
| 7 | The cable clip | Once the clip is redesigned and printed, bond it and press the lead in. Repeat test 5. | The lead presses in through the opening and stays in. The bond holds. |

Order: test 1 before ordering, tests 2 and 3 when the bracket arrives, tests 4 to 7 on the assembled mount.

## Not tested here

- The servo's own torque reacting through the bracket: up to 0.92 N·m when it stalls at 4.8 V. It has not been studied either.
- A sideways push on the horn, or the moment of an arm on the adapter.
- Repeated loads and life, and heat: no number of cycles or temperatures is set.
- The wall and its fixings.

## Open questions

- Does the MG996R's output shaft carry 20 N along its axis? Its datasheet does not say.
- Which pulse widths drive the servo to the ends of its travel? The project holds no controller.
- How strong must the clip's bond be?
- Is there a load or a life the mount must pass beyond the static 20 N?
