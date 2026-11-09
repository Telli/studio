---
name: sdf
description: "SDF for Gazebo, one job of the robot-simulation skill. Use when the person asks for $sdf by name; it hands off to the robot-simulation skill."
---

# SDF for Gazebo

One job, the same one as the "SDF for Gazebo" tile in a part's Toolbox in Studio. Do it with
the `robot-simulation` skill: read that skill first and follow it, then do what the person asks:

> Make an SDF model of the assembly for simulating it in Gazebo.

The assembly is the one the person names, else the one open beside the chat.
Ask which when neither says.

What they get: A validated SDF model for Gazebo, with its links, joints and meshes.
