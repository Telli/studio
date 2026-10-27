# Models

| Script | Output | Purpose |
| --- | --- | --- |
| parts/sizes.py | | The NEMA 17's mounting sizes, shared by the plate, its drawing and the mount |
| parts/motor_plate.py | parts/motor_plate.step | The motor plate, milled from 6061-T6 |
| parts/nema17.py | parts/nema17.step | The NEMA 17 stepper, 40 mm body: step.parts' model, as a reference part |
| parts/motor_plate_drawing.py | drawings/motor_plate_drawing.pdf | The plate's engineering drawing, with its hole table |
| assemblies/motor_mount.py | assemblies/motor_mount.step | The plate, the motor under it and its four M3 x 6 screws |
| checks/motor_plate_geometry.py | checks/motor_plate_geometry.md | The plate measured against its named sizes, and its mass |
| checks/motor_plate_dfm_measure.py | checks/motor_plate_dfm_measure.md | The plate's machining features measured for its DFM review |
| checks/motor_mount_fit.py | checks/motor_mount_fit.md | The mount's collisions and where each part sits |

Build: `python assemblies/motor_mount.py` from the project root builds the mount and the parts in it. Unchanged
models are current. `python parts/motor_plate_drawing.py` draws the plate from its saved STEP. Rerun the three checks
after the plate changes.

Imported source, from step.parts (checksums verified): parts/imported/stepper_motor_nema17_l0040_single_shaft.step
and parts/imported/iso4762_socket_head_cap_screw_m3x6.step.

Making it, from the saved STEP:

- CAM: `cadgen cam plan parts/motor_plate.step --job cam/motor_plate.cam.json --out-dir cam` writes
  cam/motor_plate.cam.glb and the LinuxCNC programs cam/motor_plate.top.ngc and cam/motor_plate.bottom.ngc.
- Machining check: `cadgen manufacturing check parts/motor_plate.step --study parts/motor_plate.machining.json
  --fail-on error` writes parts/motor_plate.machining.glb and its result beside the part.
- Strength: `cadgen fea solve parts/motor_plate.step studies/motor_plate.fea.glb --study studies/motor_plate.study.json`.
