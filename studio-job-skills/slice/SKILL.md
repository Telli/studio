---
name: slice
description: "Slice for FDM, one job of the print3d skill. Use when the person asks for $slice by name; it hands off to the print3d skill."
---

# Slice for FDM

One job, the same one as the "Slice for FDM" tile in a part's Toolbox in Studio. Do it with
the `print3d` skill: read that skill first and follow it, then do what the person asks:

> Slice the part for FDM printing and check the G-code.

The part is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: Sliced G-code from OrcaSlicer, checked against your printer and filament.
