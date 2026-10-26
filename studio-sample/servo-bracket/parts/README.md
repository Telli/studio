# Models

| Script | Output | Purpose |
| --- | --- | --- |
| parts/sizes.py | | The MG996R's sizes, from its datasheet, shared by the parts |
| parts/mg996r.py | parts/mg996r.step | MG996R servo, modeled from its datasheet's dimensions |
| parts/servo_bracket.py | parts/servo_bracket.step | The servo bracket, bent from 2 mm 5052-H32 |
| parts/servo_bracket_flat.py | parts/servo_bracket_flat.step | The bracket's flat pattern |
| parts/servo_bracket_cut.py | cut/servo_bracket_cut.dxf | The bracket's cut file: the flat pattern with its bend line |
| parts/servo_bracket_drawing.py | drawings/servo_bracket_drawing.pdf | The bracket's engineering drawing |
| parts/horn_adapter.py | parts/horn_adapter.step | Horn adapter, machined from 6061-T6 |
| parts/cable_clip.py | parts/cable_clip.step | Cable clip, printed in PETG |
| assemblies/servo_mount.py | assemblies/servo_mount.step | The mount: its parts placed by mates, the horn's travel and its `range` clip in its sidecar |
| robots/base_link.py | robots/meshes/base_link.3mf, robots/meshes/base_link.stl | The robot descriptions' base link: every part the horn does not turn |
| robots/horn_link.py | robots/meshes/horn_link.3mf, robots/meshes/horn_link.stl | Their horn link: the horn adapter, in its joint's frame |
| checks/servo_mount_fit.py | assemblies/servo_mount_fit.md | The mount's fit and clearance |

Build: `python assemblies/servo_mount.py` from the project root builds the mount and the parts in it;
`python parts/servo_bracket_flat.py` builds the flat pattern and `python parts/servo_bracket_cut.py` its cut file. Rerun
`python checks/servo_mount_fit.py` after the mount changes. Unchanged models are current. `python parts/servo_bracket_drawing.py`
draws the bracket from its saved STEP, and `python robots/base_link.py` and `python robots/horn_link.py` export the robot
links' meshes from the mount.

Exports, one-off from the saved STEPs: parts/servo_bracket.stl and parts/servo_bracket.3mf
(`cadgen stl build parts/servo_bracket.step`, `cadgen 3mf build parts/servo_bracket.step`), and parts/cable_clip.stl
(`cadgen stl build parts/cable_clip.step`).

Pictures and video, rendered from the saved mount: `cadgen step snapshot --job pictures/servo_mount_pictures.job.json`
(front, side, top, an angle, and two exploded views) and `cadgen step snapshot --job pictures/servo_mount_motion.job.json`
(the horn through its range, 720p).

Robot descriptions, authored XML beside their meshes: robots/servo_mount.urdf, robots/servo_mount.srdf and
robots/servo_mount.sdf. Check them with `cadgen urdf validate`, `cadgen srdf validate` and `cadgen sdf validate`.

Imported source: parts/imported/iso4762_socket_head_cap_screw_m3x8.step, from step.parts.

The strength study: studies/servo_bracket.study.json, solved with
`cadgen fea solve parts/servo_bracket.step studies/servo_bracket.fea.glb --study studies/servo_bracket.study.json`.
