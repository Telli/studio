# Motor mount plate (sample)

## What it is

A plate milled from 6061-T6 aluminium that mounts a NEMA 17 stepper motor to a frame: a sample project to learn Studio with. The motor sits under the plate, its 22 mm pilot in the plate's bore and its shaft up through it to a belt pulley, held by four M3 screws on its 31 mm square whose heads sit flush in a pocket on top. Two M5 screws through slots at the plate's ends fix it to the frame, and the slots give 10 mm of travel to tension the belt. It is 110 x 56 x 6 mm and weighs 76.3 g. It holds 50 N of belt tension with a safety factor of 501, and it is machined on a 3-axis mill in two setups, in 14 minutes by its CAM program.

## Decisions

- Mill the plate from 6061-T6 on a 3-axis mill, in one or two setups from stock (2026-10-26, asked)
- Make it 110 x 56 x 6 mm, from a 116 x 62 x 10 mm blank of 10 mm plate (2026-10-26, assumed)
- Hang the motor under the plate and bring its shaft up through it, so the pulley sits above the plate and the frame meets the plate's underside at its ends (2026-10-26, assumed)
- Bore the pilot Ø22.2 mm, 0.2 mm over the 22 mm pilot NEMA 17 datasheets give; step.parts' simplified motor draws a smaller pilot, 17.8 mm, so check the bought motor (2026-10-26, assumed)
- Use step.parts' NEMA 17 with a 40 mm body as the reference motor, and its ISO 4762 M3 x 6 socket head screws: they sit flush with the top and take 3 mm of the motor's thread (2026-10-26, assumed)
- Clear the motor's M3 screws at Ø3.4 and the frame's M5 screws with 5.5 mm slots, ISO 273 medium; the slots 80 mm apart along the belt with 10 mm of travel (2026-10-26, assumed)
- Pocket the top 46 mm square and 3 mm deep round the screw heads, leaving a 3 mm floor, to save weight (2026-10-26, assumed)
- Round the pocket's corners R5, over the 6 mm cutter's R3, and the outline's corners R5; leave the pocket's floor sharp to its walls; chamfer the outline's top and bottom edges 0.5 mm (2026-10-26, assumed)
- Plan the CAM for a Tormach 1100MX on LinuxCNC, with six proposed carbide and HSS tools and flood coolant, in two setups: everything from the top, then turned over to face to thickness and finish the outline (2026-10-26, assumed)
- Cut the outline's chamfers along a region at the plate's true outline, not on the chamfered top face, which would cut them 1 mm wide (2026-10-26, assumed)
- Check the machining on the pocket wall's finishing pass, the plate held by its two long sides: it passes (2026-10-26, assumed)
- Check the strength with 50 N along the belt on the pilot bore and the M3 holes, the slots held fixed: it passes with a safety factor of 501 (2026-10-26, asked)
- Draw it on one A3 sheet at 1:1, its holes and slots in a hole table, under ISO 2768-m, as a prototype (2026-10-26, assumed)

## Open actions

- Measure the bought motor's pilot before the plate is cut: the bore is sized for 22 mm, and step.parts' model has a 17.8 mm one. Then give the bore a tolerance (for example Ø22.2 +0.1/0): under ISO 2768-m alone it may come out 22.0 mm, line to line with the pilot.
- Prove the CAM program on the machine before cutting: single block, feed override low, in air first. It has not been run, and its tools, stickouts and the vise's sizes are proposed or assumed.
- Check the CAM plan's one material-left warning (up to 3 mm at the pocket's +X wall) in the Viewer's playback; it reads as the stock simulation's 0.425 mm grid, since a profile pass round the walls left it unchanged.
- Deburr the holes and slots by hand, or add a chamfer pass for them: no operation breaks their edges.
- The drawing's report lists four chamfers "3.54 x 45°" as not stated: they are the 0.5 mm outline chamfer running round the R5 corners, which note 3 states and the report misreads.
- Study the belt's pull at the pulley's height once the pulley is chosen: the moment it puts on the motor's face is not in the strength study.
- Choose the frame and the M5 screws' tightening torque, so the plate does not slide under the belt.

## In this project

- The parts: [the motor plate](parts/motor_plate.step), [the NEMA 17 motor](parts/nema17.step) and [the motor mount](assemblies/motor_mount.step), with [the models' catalog](parts/README.md).
- The checks: [geometry](checks/motor_plate_geometry.md), [fit](checks/motor_mount_fit.md), [strength](docs/motor_plate_strength_report.md), [machining](parts/motor_plate_machining.md) and [the CNC machining review](docs/motor_plate_dfm.md) with [its measurements](checks/motor_plate_dfm_measure.md).
- Making it: [the CAM job](cam/motor_plate.cam.glb) and [its program](cam/motor_plate_cam.md), with the LinuxCNC G-code for [the top](cam/motor_plate.top.ngc) and [the bottom](cam/motor_plate.bottom.ngc), and [the plate's drawing](drawings/motor_plate_drawing.pdf).
- The documents: [PRD](docs/prd.md).
- Pictures: [the mount](pictures/motor_mount_angle.png), [from below](pictures/motor_mount_below.png) and [the toolpaths](pictures/motor_plate_cam.png).
