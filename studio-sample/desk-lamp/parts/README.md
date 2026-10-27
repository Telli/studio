# Models

| Script | Output | Purpose |
| --- | --- | --- |
| parts/sizes.py | | The sizes the parts share: the two hinges, the arm, the LED module and the weight |
| parts/base.py | parts/base.step | The base, printed in PETG: the weight's pocket underneath and the clevis on top |
| parts/weight.py | parts/weight.step | The weight, a mild steel disc bonded into the base |
| parts/arm.py | parts/arm.step | The arm, printed flat in PETG: one link between the two hinges, with a slot for the LED's lead |
| parts/head.py | parts/head.step | The head, printed in PETG: the shade, its yoke, the LED bosses and the vents |
| parts/led_module.py | parts/led_module.step | The LED module, a generic Ø40 mm aluminium LED board (step.parts has none) |
| assemblies/desk_lamp.py | assemblies/desk_lamp.step | The lamp: its parts placed by mates, the `tilt` and `head` hinges and the `range` clip in its sidecar |
| checks/desk_lamp_fit.py | assemblies/desk_lamp_fit.md | The lamp's fit, clearance, range of motion, balance and holding torque |
| assemblies/desk_lamp_drawing.py | drawings/desk_lamp_drawing.pdf | The assembly drawing: the general arrangement with balloons and the parts list, and a sheet per part the project makes |
| assemblies/desk_lamp_wi.py | docs/desk_lamp_work_instructions.pdf | The work instructions for putting it together |

Build: `python assemblies/desk_lamp.py` from the project root builds the lamp and the parts in it. Rerun
`python checks/desk_lamp_fit.py` after the lamp changes (it takes about three minutes: it swings both hinges), and copy
the hinges' clear range it reports into `TILT_LIMITS` and `HEAD_LIMITS` in the assembly. Unchanged models are current.
`python assemblies/desk_lamp_drawing.py` draws the lamp and `python assemblies/desk_lamp_wi.py` writes its work
instructions, both from the saved STEP.

Exports for the printer, one-off from the saved STEPs: parts/base.stl, parts/arm.stl and parts/head.stl
(`cadgen stl build parts/<part>.step`).

Pictures and video, rendered from the saved lamp: `cadgen step snapshot --job pictures/desk_lamp_pictures.job.json`
(front, back, both sides, top, bottom, an angle, and two exploded views) and
`cadgen step snapshot --job pictures/desk_lamp_motion.job.json` (the arm and then the head through their range).

Imported source, from step.parts, each checked against its catalog checksum:
parts/imported/iso4762_socket_head_cap_screw_m5x30.step (the two hinge screws),
parts/imported/nylon_locknut_m5_simple.step (their locknuts) and
parts/imported/iso4762_socket_head_cap_screw_m3x8.step (the LED module's screws).
