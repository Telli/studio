# Desk lamp: product requirements

## Summary

A small desk lamp, printed in PETG on a Bambu Lab printer with bought hardware: a round base with a 499 g steel weight bonded underneath, one arm on a hinge at the base, and a head with an LED module on a hinge at the arm's end. Each hinge is an M5 × 30 socket head screw and a nylon insert locknut through two cheeks that clamp the arm, so it holds where it is set. It is an example project to learn Studio with: eleven parts of eight kinds, checked for fit and range of motion, drawn and given work instructions.

## The problem and who has it

A desk needs light in front of it, aimed where the work is, from a lamp that is moved by hand and stays put. The brief names no user beyond a person learning Studio: who uses the lamp, at what desk and for what work, is an open question.

## Users and use cases

- A person learning Studio opens the project to see the `cad`, fit and motion, drawing and work-instruction outputs.
- Whoever builds one prints the three PETG parts, has the weight cut, buys the hardware and the LED module, and puts it together from the work instructions.
- In use, the lamp stands on a desk; its arm is swung down or up and its head tilted to aim the light, and both stay where they are left.

## Requirements, each measurable, as must, should and could

Must:

- M1. Not tip over with the arm and the head anywhere in their range: the balance point stays inside the 59.4 mm radius the base stands on.
- M2. Swing the arm and the head through their ranges with no part colliding and nothing going through the desk.
- M3. Hold the arm and the head where they are set, against the most torque their weight puts on each hinge.
- M4. Hold an LED module in the head with its light out of the shade's opening.

Should:

- S1. Print each of the three PETG parts on a Bambu Lab printer, with support only where noted.
- S2. Use bought hardware from step.parts: ISO 4762 screws and M5 nylon insert locknuts.
- S3. Keep to about 5 to 8 kinds of parts: it has 8.
- S4. Take the LED's lead along the arm, through a slot in it.

Could:

- C1. Hold the lead in the arm's slot with clips.
- C2. Take washers under the hinge screws' heads and nuts.

## Performance targets: loads, life, temperatures, cycles

- Range (`assemblies/desk_lamp_fit.md`): the arm tilts clear from 45 degrees down to 136 degrees up about its rest, 55 degrees up from the desk, so from 10 to 191 degrees up from the desk, stopped each way by the head reaching the desk. The head tilts clear from 46 degrees down to 175 degrees up about hanging level, stopped each way by the arm. 28 of the 238 combined poses checked at 15 degree steps are blocked by the desk, all with the arm near an end of its range.
- Balance: at the worst pose found, the balance point is 33.2 mm from the base's centre, 26.2 mm inside its edge, with the printed base's own mass left out.
- Holding: the base's hinge must hold up to 0.166 N·m, the head's up to 0.022 N·m. On an assumed friction of 0.3 between PETG faces that is a clamp of 48 N and 6 N; the screws' torque is to be set by test.
- Light output, colour, heat from the LED, life, cycles and temperatures: not set (open questions).

## Size, weight and interfaces

- Size at rest: 228.7 mm long by 221.8 mm high (the drawing's reference sizes), on a Ø120 mm base 18 mm high.
- Mass: 781.7 g, the weight 498.8 g of it, the printed parts weighed solid.
- Hinges: M5 screws in Ø5.5 mm holes; the 10 mm arm between cheeks 10.2 mm apart, 0.1 mm a side. The base's hinge is 48 mm above the desk and 30 mm behind the base's centre; the arm is 200 mm between hinges.
- LED module: a Ø40 mm board on two bosses 32 mm apart, held by two M3 × 8 screws cut into Ø2.5 mm pilot holes; eight Ø5 mm vents above it.
- Weight: Ø90 × 10 mm in a Ø90.2 mm pocket, flush with the base's underside.

## Safety and regulations

No standard or regulation is named (open question). The LED's supply and driver are not in the project: their voltage decides what electrical safety rules apply, and the head's PETG must stay below its softening point at the LED's running temperature, which is not known.

## Cost target and volumes

Not set. One prototype; no quotes asked for.

## How success is measured

- The fit check finds no collision at rest and the ranges above: it does.
- The lamp does not tip anywhere in its range: in the model, 26.2 mm to spare at worst.
- The first lamp holds at full reach and swings through its range as the work instructions' last step checks: not built yet.

## Out of scope

- The LED's driver, power supply, switch and wiring.
- The light itself: its brightness, colour and spread.

## Milestones

- Done (2026-10-26): the parts and the assembly modelled with mates and two hinges, the fit, range, balance and holding check, pictures from every side, exploded views and a motion video, the assembly drawing and the work instructions.
- Next, not dated: choose the LED module and its driver, choose the weight's adhesive, print and build one, and set the hinges' tension.

## Open questions

- Who uses it, at what desk, and how much light is needed where?
- Which LED module and driver? The head's bosses and vents follow a generic Ø40 mm envelope.
- How hot does the LED run, and is PETG enough for the head?
- Which adhesive for the weight, and should the hinges take washers?
- Is the arm's full range wanted, or should a stop keep it from folding back behind the base?
