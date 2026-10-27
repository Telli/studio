# Motor plate: the CAM program

Ready to cut · 14 min · 6 tools. Planned with `cadgen cam plan parts/motor_plate.step --job cam/motor_plate.cam.json --out-dir cam`: the job is `cam/motor_plate.cam.json`, the toolpaths, the simulated cut and the Job panel are in `cam/motor_plate.cam.glb` (open it in the Viewer to play the cut), and the programs are `cam/motor_plate.top.ngc` and `cam/motor_plate.bottom.ngc`.

## The machine and the stock

- A Tormach 1100MX (cadgen's catalog model: 10,000 rpm spindle), posted for **LinuxCNC** (`.ngc`), as the Tormach runs it. The machine was chosen for this sample, not given.
- 6061-T6, a 116 x 62 x 10 mm blank cut from 10 mm plate: 3 mm over the plate on every side, 3 mm under it and 1 mm over it. Flood coolant throughout.

## The tools

All proposed for this sample, not a shop's list. Speeds and feeds are starting points from cadgen's table for 6061, not tuned for any machine. Every Z in the programs is the tool's lowest point (an end mill's face, a drill's or spot drill's or chamfer mill's tip): set each tool's length there.

| Tool | What | Speed | Feed | Stickout |
| --- | --- | --- | --- | --- |
| T1 | 10 mm 3-flute carbide end mill, 22 mm flutes | 7,960 rpm | 1,462 mm/min facing, 1,075 profiling | 30 mm |
| T2 | 6 mm 3-flute carbide end mill, 13 mm flutes | 10,000 rpm | 1,225 mm/min | 20 mm |
| T3 | 4 mm 2-flute carbide end mill, 11 mm flutes | 10,000 rpm | 400 mm/min in the slots | 16 mm |
| T4 | 6 mm 90° HSS spot drill | 3,710 rpm | 178 mm/min | 11 mm (assumed) |
| T5 | 3.4 mm HSS jobber drill, 39 mm flutes | 4,920 rpm | 268 mm/min, pecked | 45 mm |
| T6 | 6 mm 90° carbide chamfer mill | 10,000 rpm | 800 mm/min | 23 mm (assumed) |

## Setup 1, top: `motor_plate.top.ngc`, G54, runs first

The blank in the vise on parallels, the jaws across its 62 mm width gripping its bottom 3 mm. Work zero X0 Y0 at the blank's centre, Z0 on its top face: touch off there.

1. Face the top 1 mm, T1 (1 min 44 s).
2. The weight-saving pocket, 3 mm deep in two levels, 0.2 mm left on the walls for one finishing ring, T2 (3 min 4 s).
3. The Ø22.2 pilot bore, helix bored 0.2 mm into the blank under the plate, T2 (1 min 14 s).
4. Spot the four M3 holes, T4 (17 s).
5. Peck drill them Ø3.4, T5 (19 s).
6. and 7. The two M5 slots, 5.5 mm wide, ramped down along their centrelines to 0.2 mm under the plate, T3 (1 min 17 s and 1 min 7 s).
8. The outline, 5 of its 6 mm, T1 (1 min 36 s).
9. Chamfer the outline's top edge 0.5 mm, T6 (39 s).

## Setup 2, bottom: `motor_plate.bottom.ngc`, G55

Turn the plate over onto parallels, its faced top down, and grip it 4 mm up in the vise. Work zero X0 Y0 at the blank's centre, Z0 on the raw bottom face it now shows: touch off there, before the facing.

10. Face the 3 mm under the plate off, T1 (1 min 44 s): the holes, slots and bore come through.
11. The outline's last 1 mm, with 0.5 mm of overlap, T1 (39 s).
12. Chamfer the outline's bottom edge 0.5 mm, T6 (39 s).

Then deburr the holes and slots by hand (no operation breaks their edges).

## Warnings, notes and assumptions

- **Material left: 47 mm³ over 102 mm², up to 3 mm proud, at (22.96, -7.84, 6) mm**, at the pocket's +X wall. A separate profile pass round the pocket's walls, tried while planning, left the same reading at the same point, so it reads as the stock simulation's 0.425 mm grid at that wall, not as uncut metal. Check the pocket's walls in the Viewer's playback.
- Spindle held to the 1100MX's 10,000 rpm: T2 (13,260 rpm by the table), T3 (19,890) and T6 (13,260). Their feeds follow the slower spindle, so each tooth takes the planned chip.
- The vises are modelled with the sizes the job does not state: jaws 150 mm wide and 20 mm thick, a 10 mm floor, 6 mm parallels.
- Each chamfer is cut into an edge the model has already chamfered, so the gouge check does not judge it. The chamfers are cut on the outline at the plate's true size (a 68-point region round its R5 corners) so they land on the modelled 0.5 mm chamfer.
- Assumed: a 10 s tool change (Tormach publishes none, so the cycle time uses a generic one); T4's flute length 6 mm and stickout 11 mm; T6's flute length 18 mm and stickout 23 mm. Which spot drill and chamfer mill are held, and how far out?
- The 14 min is a lower bound: moves at their feeds, rapids and tool changes, with no spindle spin-up, setting up or slowing into corners.

Prove this program on the machine: single block, feed override low, in air first. Check the post is LinuxCNC's, set G54 and G55 and every tool length, play the cut in the Viewer, dry-run it above the part, then cut single-block with the overrides down. The G-code has not been run on a machine.
