---
name: studio-part-editor
description: Use whenever you make or change a text-to-cad part in Studio. The engineer sees the part in Studio's part editor beside the chat and changes its sizes by hand there; every hand edit is a number changed in the part's script.
---

# Writing parts the engineer can edit by hand

Studio's part editor reads a part script as a design. It runs the script, shows a timeline with one
row per line of the function that designs the part, lists the named sizes, and draws dimensions on
the model. When the engineer changes one, the editor changes the number in the script behind it and
rebuilds the part.

## Write the script so it edits well

- **Name the sizes that matter at the top of the file**, one per line, in the project's units:
  `LENGTH = 2.80`, `WALL = .060`. They become the editor's parameters. Use plain names, not
  abbreviations (`TRAY_HEIGHT`, not `TH`).
- **Build each feature from those names**, so a dimension on the model leads back to a size
  (`LENGTH - 2*WALL`), not to a number computed somewhere else.
- **One feature per line** in the function that designs the part (`outer = ...`, `cavity = ...`,
  `tray = outer - cavity`): each line is a row in the editor's timeline, named after its variable.
- **Profiles as `Rectangle`, `RectangleRounded`, `Box` or `Cylinder` placed with `Pos(...)`** get
  dimensions drawn on the model. Other shapes still show their sizes in the timeline.
- A unit constant (`INCH = 25.4`) is fine: the editor shows lengths in the project's units.

## When you make or change a part

- After building it, call `part_editor_open` with the part's script so the engineer sees it.

## Their edits

- The engineer's hand edits are ordinary edits to the script. When they change something, their
  next message carries a note ("In the part editor I changed LENGTH from 2.80 to 3.00
  (parts/housing_geometry.py, line 8)").
- Read the script again before you change it, and keep their values unless they ask.
- Do not rebuild or recheck because they edited something: the editor already rebuilt the part.

## Failed checks

When a check fails, propose the change (which size, to what, and why) and wait for a go.
