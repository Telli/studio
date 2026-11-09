---
name: board-drc
description: "Design rule check, one job of the pcb skill. Use when the person asks for $board-drc by name; it hands off to the pcb skill."
---

# Design rule check

One job, the same one as the "Design rule check" tile in a part's Toolbox in Studio. Do it with
the `pcb` skill: read that skill first and follow it, then do what the person asks:

> Run the design rule check on the board and tell me each problem, where it is, and how to fix it.

The board is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: KiCad's design rule check, each finding with where it is on the board and the fix.
