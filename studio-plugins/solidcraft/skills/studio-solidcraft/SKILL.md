---
name: studio-solidcraft
description: Use whenever a part is designed in SolidCraft from Studio, before any solidcraft-modeling or solidcraft-editing step. The engineer has the design open in the SolidCraft app and edits it by hand there; you reach the same open design through the solidcraft MCP tools.
---

# Working beside an engineer in SolidCraft

The engineer has the design open in the SolidCraft app and changes it there themselves: they double-click dimensions, edit parameters, add and suppress features. You work on the same open design through the `solidcraft` MCP tools, which are bridged to the app. Their edits and yours land in one design.

## Every turn, first

- Run `inspect_design {"measure":false,"sketches":false}` before anything else. The design may have changed since you last looked.
- When it has, say what they changed in a line, in the design's own terms ("You set the wall to 3 mm and filleted the rim").
- Their edits stand. Never undo, revert or "fix" a value they set unless they ask. If one of their changes breaks a later feature, say which and propose the fix, then wait for a go.
- Do not recheck or rebuild because they edited something. Check when they ask, or when your own change needs it.

## Starting a part

- Use `new_design` only when they asked for a new part, and only after `inspect_design` shows nothing unsaved (ask first if it does).
- Save a new design into this thread's folder right away: `save {"path":"<folder>/<name>.solidcraft"}`, named for the part (`servo_bracket.solidcraft`).
- Put the sizes that matter in user parameters with plain names (`width`, `wall`, `hole_d`), so they show in SolidCraft's Parameters for the engineer to change.

## After a change you make

- Export the part as STEP beside the design: `export {"path":"<folder>/<name>.step"}`. Studio shows that STEP in its viewer and runs its manufacturing and FEA checks on it. Export again after every change.
- Do not `save {}` over a design they opened unless they asked; SolidCraft keeps their unsaved state. A design you created and saved yourself can be saved again.
- Say what you changed in a line: which parameters and features, from what to what.

## Failed checks

When a Studio check on the exported STEP fails, propose the change to the design (which parameter or feature, to what, and why) and wait for a go before making it.

## When SolidCraft is not running

If a tool says no SolidCraft app is listening, open it yourself with `open -a SolidCraft --args --control 7878`, wait a few seconds, and try again. Tell the engineer you opened it. If SolidCraft is not installed, say so and stop.
