# Edit mode

The CAD viewer edits a part by hand while its Python script stays the source. It runs the script,
shows a design tree with the part's named sizes (Parameters) and its history (one feature per
operation the script performs, numbered as a CAD tree numbers them: Extrude1, Fillet1), and draws
the selected feature's dimensions on the model. When the engineer changes a value, the viewer
rewrites that one number in the script, keeping how it was written, and builds again every part
that uses the changed file.

## Write the script so it edits well

- **Name the sizes that matter at the top of the file**, one per line, in the project's units:
  `LENGTH = 2.80`, `WALL = .060`. They become the Parameters. Use plain names, not abbreviations
  (`TRAY_HEIGHT`, not `TH`).
- **Build each feature from those names**, so a dimension on the model leads back to a size
  (`LENGTH - 2*WALL`), not to a number computed somewhere else.
- **One feature per line** in the function that designs the part (`outer = ...`,
  `cavity = ...`, `tray = outer - cavity`): each line is a feature of the history, with its
  variable's name beside it.
- **Profiles as `Rectangle`, `RectangleRounded`, `Box` or `Cylinder`, placed with `Pos(...)`**, get
  dimensions drawn on the model. Other shapes still show their sizes in the history.
- A unit constant (`INCH = 25.4`) is fine: lengths show in the project's units.

## Hand edits

- A hand edit is an ordinary edit to the script. The engineer's next message carries a note of
  each one ("In edit mode I changed Length (LENGTH) from 2.80 to 3.00 (parts/sizes.py, line 8).").
- Read the script again before you change it, and keep their values unless they ask.
- Do not rebuild or recheck because they edited something: the viewer already rebuilt the parts
  that use the file.
- When a check fails, propose the change (which size, to what, and why) and wait for a go.
