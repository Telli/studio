# Motor plate: the CAM program

Ready to cut · 2 min · 3 tools. Planned with `cadgen cam plan parts/motor_plate.step --job cam/motor_plate.cam.json --out-dir cam`, by FreeCAD 1.1.3: the job is `cam/motor_plate.cam.json`, the toolpaths are in `cam/motor_plate.cam.glb` (open it in the Viewer), and the program is `cam/motor_plate.top.ngc`.

The program does not cut the Ø22.2 pilot bore or the two M5 belt slots: cadgen's 3-axis CAM cuts no through bore larger than a drill and no through slot. They are cut by hand on the mill (below).

## The machine and the stock

- A Tormach 1100MX (10,000 rpm spindle), posted for **LinuxCNC** (`.ngc`), as the Tormach runs it. The machine was chosen for this sample, not given.
- 6061-T6, a 116 x 62 x 7 mm blank: 3 mm over the plate on every side and 1 mm over its top. Its bottom is the plate's bottom. Flood coolant throughout.
- The blank stands on a sacrificial plate, held down with double-sided tape: the outline is cut 0.5 mm into that plate to cut the part free, and nothing else holds it then.

## The tools

All proposed for this sample, not a shop's list. Speeds and feeds are starting points from cadgen's table for 6061, not tuned for any machine.

| Tool | What | Speed | Feed | Stickout |
| --- | --- | --- | --- | --- |
| T1 | 10 mm 3-flute carbide end mill, 22 mm flutes | 7,960 rpm | 1,462 mm/min facing, 1,433 profiling | 30 mm |
| T2 | 6 mm 3-flute carbide end mill, 13 mm flutes | 10,000 rpm | 1,225 mm/min | 20 mm |
| T4 | 3.4 mm jobber drill, 39 mm flutes | 10,000 rpm | 680 mm/min, pecked 2 mm | 45 mm |

## Setup 1, top: `motor_plate.top.ngc`, G54

Work zero X0 Y0 at the blank's centre, Z0 on its top face: touch off there.

1. Face the top 1 mm, T1 (1 min 4 s).
2. The weight-saving pocket, 3 mm deep, T2 (39 s).
3. Drill the four M3 clearance holes Ø3.4, through, T4 (6 s).
4. Cut the outline free, 0.5 mm into the sacrificial plate, T1 (17 s).

Then, with the plate still taped down, cut by hand (a circular pocket and two slots, conversationally or with a short program of the shop's own):

- the Ø22.2 pilot bore, through, with T2;
- the two belt slots, 5.5 mm wide with their ends' centres 10 mm apart, centred on X ±40, through, with a 4 mm end mill.

Deburr every edge by hand: the model's 0.5 mm chamfers on the outline are not cut.

## Warnings, notes and assumptions

- Spindle held to the 1100MX's 10,000 rpm for T2 (13,260 rpm by the table) and T4 (14,040). Their feeds follow the slower spindle.
- The drill turns at the table's carbide speed, held to 10,000 rpm: slow it for a high-speed steel drill.
- The 2 min is a lower bound: moves at their feeds, rapids at an assumed 5,000 mm/min and tool changes, with no spindle spin-up or setting up.

Prove this program on the machine: single block, feed override low, in air first. Check the post is LinuxCNC's, set G54 and every tool length, look over the toolpaths in the Viewer, dry-run it above the part, then cut single-block with the overrides down. The G-code has not been run on a machine.
