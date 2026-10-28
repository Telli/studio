# Shelf bracket: product requirements

## Summary

A wall shelf bracket bent from 14 gauge G90 galvanised steel, SendCutSend's G90-074 (0.074 in, 1.88 mm). A tapering web stands on edge as the bracket's gusset; a flange bent off its top carries the shelf, and a flange bent off its back fixes it to a wall with two screws. Two of them hold a 200 mm deep shelf with up to 15 kg on it. It is laser cut and bent by SendCutSend from its STEP. It is an example project to learn Studio with.

## The problem and who has it

Someone wants a plain, strong shelf on a wall: a board 200 mm deep, books or jars on it, up to 15 kg. Bought brackets come in fixed sizes and finishes; this one is cut and bent to order, and its sizes are the project's to change. The brief names no one beyond a person learning Studio: who fits the shelf, and where, is an open question.

## Users and use cases

- A person learning Studio opens the project to see a sheet metal part taken from a model to an order: the flat pattern, the checks, the drawing and the upload.
- Whoever builds the shelf orders two brackets from SendCutSend, screws them to a wall into plugs, and screws the board down onto them from below.
- In use, the shelf carries a load that sits still, put on and taken off by hand.

## Requirements, each measurable, as must, should and could

Must:

- M1. Hold a 200 mm deep shelf with up to 15 kg on it, with a safety factor of at least 2 against yield.
- M2. Fix to a wall with two screws.
- M3. Be bent from one sheet, with a stiffening gusset or flange.
- M4. Be laser cut and bent by SendCutSend, as drawn, with no changes.

Should:

- S1. Sag no more than 1 mm at the arm's tip under that load.
- S2. Need no finish: galvanised as it comes.
- S3. Hold the shelf board down with two screws from below.

Could:

- C1. Be powder coated by SendCutSend, which G90-074 offers.
- C2. Be ordered as its cut file as well as its STEP.

## Performance targets: loads, life, temperatures, cycles

- Load: 15 kg (147.1 N) down on the shelf flange of one bracket, the whole shelf's load on one bracket. The strength study gives a safety factor of 2.43 in the bracket itself (130.8 MPa at the corner relief, against 317.2 MPa yield), and 0.34 mm of sag at the tip, 0.91 mm of movement in all (`docs/shelf_bracket_strength_report.md`). At the rigid wall holes the model reads a higher peak, which the report explains.
- Life, cycles and temperatures: not set (open questions). Indoors, at room temperature, is assumed.

## Size, weight and interfaces

- Size: the arm is 180 mm long and the leg 150 mm high, outside; both flanges are 25 mm wide.
- Weight: 366 g, from the model's volume and G90's density.
- Wall: two Ø5.5 mm holes for 5 mm wood screws into plugs, 100 mm apart, the upper 25 mm below the shelf, 14 mm from the web's outside face.
- Shelf: two Ø4.5 mm holes for 4 mm wood screws up into the board, 100 mm apart, the first 40 mm from the wall. The board overhangs the arm's tip by 20 mm.

## Safety and regulations

No standard or regulation is named for it (open question). The cut edges of the steel are bare and sharp unless deburred; the free corners are rounded R3 and R6.

## Cost target and volumes

Not set. Two brackets for one shelf; no quote has been asked for.

## How success is measured

- The strength study keeps a safety factor of at least 2 in the bracket itself: now 2.43. The study's own figure at the wall holes, a rigid fixture, is 1.47, and a study with the screw heads and the wall in it is an open action.
- The tip moves under 1 mm: now 0.34 mm down, 0.91 mm in all, most of it a twist a shelf board would hold.
- The sheet metal check passes: it does now, after the corner relief was opened from 5 to 7 mm.
- SendCutSend's preflight passes for the STEP: it does. The cut file fails on its bend line type only.
- The first pair, screwed up with a board and 15 kg on it, holds without a visible bend.

## Out of scope

- The shelf board, the wall and its plugs.
- A bracket for a deeper shelf or a heavier load: change the sizes and run the checks again.

## Milestones

- Done (2026-10-26): the bracket and its flat pattern modelled, the strength study, the sheet metal check, the cut file and its SendCutSend preflight, and the drawing.
- Next, not dated: order a pair, fit them with a board and load them.

## Open questions

- Which wall, and which screws and plugs? The holes are sized for 5 mm wood screws.
- Is the whole 15 kg ever on one bracket, as the study assumes, or always shared by two?
- How long must it last, and does any standard apply?
- Galvanised as it comes, or powder coated?
