# Servo mount: FMEA

Thirteen ways the servo mount could fail, from the bracket to the wall it is fixed to. The adapter's spline ranks highest, at 160, then the servo's screw threads and the servo's own torque on the bracket, at 140 each. Two are not rated because nothing in the project says how likely they are, and one of them, the wall fixing, is among the most severe.

## A table: item and function, failure mode, effect, severity (1 to 10), cause, occurrence (1 to 10), current controls, detection (1 to 10), risk priority number, recommended action

| Item and function | Failure mode | Effect | Severity | Cause | Occurrence | Current controls | Detection | Risk priority number | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bracket's screw holes: locate and hold the servo | They do not line up with the servo's tab holes | The servo cannot be fitted, and the bracket is made again | 5 | The holes' spacing is not in the datasheet: 47.45 mm along is assumed, and 9.5 mm across is a seller's measurement | 4 | The assumption is written down (`parts/sizes.py`), and test plan 1 measures a servo before ordering | 3 | 60 | Measure a real MG996R before ordering |
| Tapped M3 threads: hold the servo's screws | The threads strip | The servo comes loose | 7 | 2 mm of 5052-H32 holds only 4 turns of an M3 × 0.5 thread, and no tightening torque is set | 4 | Test plan 3 runs a screw in by hand | 5 | 140 | Set a tightening torque, prove it on the first bracket, and add it to the assembly instructions |
| Web between each tapped hole and the cutout: carry the screw's load | It bulges or cracks when tapped or tightened | The hole moves and the screw holds less | 5 | The web is 1.725 mm, under the general guides' 2.0 and 3.175 mm, though it passes SendCutSend's 0.61 mm | 3 | The sheet metal check flags it; the holes are tapped after bending; test plan 3 looks at the web | 3 | 45 | Look at the web on the first bracket. It can grow only with another servo's hole pattern. |
| Bend: set the shelf level | The angle is off by up to 1° | The shelf's front edge is out by up to 0.70 mm, and the servo does not sit level | 3 | SendCutSend's ±1° bend tolerance | 3 | The drawing's tolerance; test plan 2 | 3 | 27 | None, unless the servo must sit level |
| Bend: carry the load to the flange | It cracks on its outside | The bracket is weaker at the bend | 7 | An inside radius of 0.965 mm, 0.48 of the thickness, and a grain direction no one has set | 3 | SendCutSend's own radius for this sheet; the sheet metal check flags the radius and leaves the grain unverified; test plan 2 looks along the bend | 3 | 63 | Ask SendCutSend whether the grain direction matters for this bend |
| Bracket: hold 20 N at the horn | It yields | The shelf bends for good and the servo sags | 7 | 20 N held steady | 2 | The strength study: a safety factor of 3.66; test plan 6 | 2 | 28 | None for this load |
| Bracket and screws: hold the servo against its own torque | The bracket twists or the screws loosen | The servo moves in the bracket | 7 | The servo's torque, up to 0.92 N·m when it stalls at 4.8 V, reacts through its four screws, and it has not been studied | 4 | None | 5 | 140 | Study the stall torque's reaction, and add a test for it |
| Horn adapter on the spline: turn the load | It slips on the spline or works loose | The load is not driven, or comes off with the adapter | 8 | The spline is broached after milling and no job plans it; no drawing gives its fit; the horn screw's length is not checked | 4 | The adapter's model says the bore is broached; test plan 4 checks that it seats | 5 | 160 | Plan the broaching and the spline's size, draw the adapter with its fit, and check the horn screw's length |
| Horn adapter: clear the servo's case | It rubs the case top | Wear, and drag on the servo | 4 | It is not pushed down to the top of the spline, or a real spline stands lower than the datasheet's 5.7 mm above the case | 2 | The fit check: 1.699 mm through the whole travel; test plans 4 and 5 | 3 | 24 | Check the gap after assembly |
| Servo's case in the cutout: locate the servo | It binds | The servo will not go in, or is squeezed | 4 | A real case bigger than the datasheet's 40.9 × 20.0 mm | 2 | The fit check: 0.217 mm at the tightest, on a case drawn as the datasheet's box; test plans 1 and 4 | 3 | 24 | Measure a real case |
| Cable clip: hold the lead | Its lips break, or it will not print | The lead hangs loose | 3 | Its lips narrow to 0.37 mm, where a wall that stands free needs 1.6 mm, and its STL is not watertight | 7 | The FDM check fails it | 2 | 42 | Round the lips (R0.8), thicken the wall from 1.6 to 2.0 mm, repair the mesh, and check again |
| Clip's bond: hold the clip on the flange | It lets go | The clip falls off and the lead hangs loose | 3 | No adhesive or surface preparation is chosen | Not known | Test plan 7 | 3 | Not rated | Choose an adhesive and a preparation for PETG on aluminium |
| Wall fixing: hold the mount on the wall | It pulls out | The mount and its load fall | 8 | The wall and its fixings are not chosen | Not known | None: the strength study takes the wall as rigid | 7 | Not rated | Choose fixings for the wall that carry the load and the servo's torque |

The ratings follow one key, so they can be compared:

- Severity: 8 the mount or its load can fall; 7 the servo or the load comes loose, or a part is weakened; 5 a part has to be made again; 4 it works but wears or binds; 3 a small fault, easily put right.
- Occurrence: 2 a check passes with margin; 3 a tolerance allows it, or a check flags it for review; 4 it rests on an assumption not yet measured or a step not yet planned; 7 a check fails today; not known where nothing in the project bears on it.
- Detection: 2 a check catches it now; 3 a test in the test plan catches it before use; 5 only use shows it; 7 nothing would catch it.
- The risk priority number is severity × occurrence × detection.

## The highest risks, and what to do first

1. Measure a real MG996R before the bracket is ordered (60). It costs least, and every hole in the bracket follows it.
2. Plan the adapter's spline: who broaches it, to what size and fit, and check the horn screw's length (160).
3. Choose the wall's fixings (not rated, severity 8): the one failure that drops the whole mount.
4. Set the M3 screws' tightening torque and prove it on the first bracket (140).
5. Study the servo's stall torque reacting through the bracket (140).
6. Then fix the cable clip as its FDM check says, and ask SendCutSend about the bend's grain.
