# Shelf bracket: bending check

Ready to bend: both bends form without cracking and spring back 0.23°, inside SendCutSend's ±1°, so each needs an overbend of 0.23°. This is an estimate by hand formulas per bend, read from the STEP, not a forming simulation.

## What was run

`cadgen manufacturing check parts/shelf_bracket.step --study parts/shelf_bracket.sheet_metal.json --fail-on error`, the `sheet_metal` process, on the bracket as it is now (the 7 mm corner relief). It wrote `parts/shelf_bracket.sheet_metal.glb`, the bracket drawn as it comes off the brake and coloured by each bend's springback, and `parts/shelf_bracket.sheet_metal.result.json`, every number. It exited 0.

- Sheet: cadgen's `crs-1008` (low-carbon cold-rolled steel, minimum R/t 0) with SendCutSend's figures for G90-074 put over it: E 199,948 MPa, ν 0.30, yield 317.2 MPa, tensile 386 MPa (the low end of their 56 to 65 ksi), elongation 20%. G90 is a galvanised low-carbon steel (ASTM A653); cadgen's table has no galvanised sheet.
- Thickness 1.8796 mm, which the check measured on the part too (0% apart). Tolerance ±1°, SendCutSend's for bends up to 24 in.
- Held flat: the web, the largest. No grain direction given.

## Per bend

| Bend | Angle and inside radius | Length | Cracking | Springback | Overbend | Flat pattern (cadgen's DIN 6935 estimate) |
| --- | --- | --- | --- | --- | --- | --- |
| 1, the wall bend | 90° at R 1.6 mm, R/t 0.851 | 143 mm | outer strain 37%, against 100% allowed at R/t 0 | 0.23°, 0.962° with work hardening | 0.231° | K 0.31, BA 3.42 mm, BD 3.54 mm |
| 2, the shelf bend | 90° at R 1.6 mm, R/t 0.851 | 173 mm | outer strain 37%, against 100% allowed | 0.23°, 0.962° with work hardening | 0.231° | K 0.31, BA 3.42 mm, BD 3.54 mm |

- The far flat, either flange, ends 0.23° off its CAD angle, within ±1°.
- Reliefs: every bend ends at an edge or a relief cut (0 missing).
- The checklist: 8 passed, 0 warnings, 0 failed. Verdict: "Ready to bend · 2 bends · overbend up to 0.231°".

## What it means

- Low-carbon steel bends flat on itself, so 37% of outer strain at SendCutSend's R 1.6 mm is no risk to the steel. The zinc coating is another matter, and the check knows nothing of it: G90's coating can flake at a tight bend. Look at the outside of both bends on the first part.
- Springback with work hardening, 0.962°, is close to the 1° tolerance. It rests on cadgen's work-hardening exponent for this steel, n 0.22, which its table marks unverified. SendCutSend sets its own overbend on the brake; nothing here changes the model.
- The flat pattern is SendCutSend's, not this estimate's: their K 0.40 and bend deduction 0.129 in (3.28 mm) for G90-074 govern, and `parts/shelf_bracket_flat.py` uses them. cadgen's DIN 6935 K-factor, 0.31, is a general estimate, and would make each bend's deduction about 0.27 mm larger than the 3.265 mm the flat is developed with.

## Limits, as the run gives them

- An estimate per bend by hand formulas: Gardiner's springback (the sheet elastic, then perfectly plastic at its yield), the outer fibre's strain against the sheet's minimum R/t, DIN 6935's K-factor.
- The inside radius is the CAD's: an air bend takes the radius its die opening sets, and the shop's bend table and a test bend override these numbers.
- No thinning, anisotropy or residual stress; the flats stay flat and turn rigidly.
