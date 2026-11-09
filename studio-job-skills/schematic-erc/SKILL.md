---
name: schematic-erc
description: "Electrical rule check, one job of the pcb skill. Use when the person asks for $schematic-erc by name; it hands off to the pcb skill."
---

# Electrical rule check

One job, the same one as the "Electrical rule check" tile in a part's Toolbox in Studio. Do it with
the `pcb` skill: read that skill first and follow it, then do what the person asks:

> Run the electrical rule check on the schematic and tell me each problem, the part or net it is on, and how to fix it.

The schematic is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: KiCad's electrical rule check, each finding with the part or net and the fix.
