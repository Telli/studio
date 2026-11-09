---
name: toolpaths
description: "G-code for CNC, one job of the cam skill. Use when the person asks for $toolpaths by name; it hands off to the cam skill."
---

# G-code for CNC

One job, the same one as the "G-code for CNC" tile in a part's Toolbox in Studio. Do it with
the `cam` skill: read that skill first and follow it, then do what the person asks:

> Plan the toolpaths for the part and post its G-code. Ask me for the machine, stock, tools and workholding you need.

The part is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: G-code for each setup, and its toolpaths to look over before cutting.
