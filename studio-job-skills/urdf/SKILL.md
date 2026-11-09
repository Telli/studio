---
name: urdf
description: "URDF, one job of the robot-simulation skill. Use when the person asks for $urdf by name; it hands off to the robot-simulation skill."
---

# URDF

One job, the same one as the "URDF" tile in a part's Toolbox in Studio. Do it with
the `robot-simulation` skill: read that skill first and follow it, then do what the person asks:

> Make a URDF for the part with its links, joints and limits.

The part is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: A validated URDF with its links, joints, limits and a mesh for each link.
