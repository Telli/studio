# Edit mode

The CAD viewer edits a part by hand while its Python script stays the source. It runs the script,
shows a design tree with the part's named sizes (Parameters) and its history (one feature per
operation the script performs, numbered as a CAD tree numbers them: Extrude1, Fillet1), and draws
the selected feature's dimensions on the model. When the engineer changes a value, the viewer
rewrites that one number in the script, keeping how it was written, and builds again every part
that uses the changed file.

Its ribbon also has modeling commands: Hole, Pattern and Mirror (Create), Fillet, Chamfer and
Shell (Modify). Each acts on what the engineer selects (edges or faces on the model, or a feature
in the history) and writes one line of build123d into the script, after the statement that makes
the part's body, which then reads back as a new feature of the history.

## Write the script so it edits well

- **Name the sizes that matter at the top of the file**, one per line, in the project's units:
  `LENGTH = 2.80`, `WALL = .060`. They become the Parameters. Use plain names, not abbreviations
  (`TRAY_HEIGHT`, not `TH`).
- **Build each feature from those names**, so a dimension on the model leads back to a size
  (`LENGTH - 2*WALL`), not to a number computed somewhere else.
- **One feature per line** in the function that designs the part (`outer = ...`,
  `cavity = ...`, `tray = outer - cavity`): each line is a feature of the history, with its
  variable's name beside it.
- **Keep the body in one name and return it** (`tray = ...`, then `return tray`), in build123d's
  algebra style. A command writes its line right after the last statement that makes the body,
  before `label` and `color` are set. A body returned outright (`return Box(...)`) is first put
  in a name (`part = Box(...)`); a part built in builder style (`with BuildPart()`) takes no
  commands yet.
- **Profiles as `Rectangle`, `RectangleRounded`, `Box` or `Cylinder`, placed with `Pos(...)`**, get
  dimensions drawn on the model. Other shapes still show their sizes in the history.
- A unit constant (`INCH = 25.4`) is fine: lengths show in the project's units.

## What the commands write

- **Faces and edges by where they are, never by number**: build123d's own selectors, the
  cheapest chain that picks exactly what was selected, run before it is written. Fillet on the
  top face's outer edges writes
  `tray = bd.fillet(tray.faces().sort_by(bd.Axis.Z)[-1].outer_wire().edges(), radius=.03*INCH)`.
  A face selected for a fillet or a chamfer stands for its edges.
- **Hole**: a cylinder cut into the selected flat face, from its centre or moved along the two
  axes in its plane: `tray -= bd.Pos(1.37*INCH, 0) * bd.Plane(<face>) * bd.Cylinder(.03/2*INCH,
  .1*INCH, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MAX))`; through all, its depth is
  `tray.bounding_box().diagonal`.
- **Shell**: `bd.offset(body, amount=-thickness, openings=<faces>)`.
- **Mirror and Pattern** copy the feature picked in the history, or the whole body. A feature's
  tool written inline is named where it is made, so the copy follows it:
  `plate -= (hole1 := bd.Pos(...) * bd.Cylinder(...))`, then
  `plate -= bd.mirror(hole1, about=bd.Plane.YZ)` or
  `plate -= [loc * hole1 for loc in bd.GridLocations(-.4*INCH, 0, 3, 1, align=(bd.Align.MIN, bd.Align.CENTER)).locations[1:]]`
  (a circular pattern uses `bd.PolarLocations(0, count)`, about the Z axis).
- Sizes are written in the project's units, as the file writes them (`.03*INCH` in an inch part).
- A line that does not run, or does not make the feature on what was selected, is not written.

## Hand edits

- A hand edit is an ordinary edit to the script. The engineer's next message carries a note of
  each one ("In edit mode I changed Length (LENGTH) from 2.80 to 3.00 (parts/sizes.py, line 8).",
  "In edit mode I added Fillet2, radius 0.03 in, 1 edge (parts/housing_geometry.py, line 37).").
- A command's line is the engineer's: keep it, and keep its selector unless a change you make
  moves what it selects (then say so, and propose the new selector).
- Read the script again before you change it, and keep their values unless they ask.
- Do not rebuild or recheck because they edited something: the viewer already rebuilt the parts
  that use the file.
- When a check fails, propose the change (which size, to what, and why) and wait for a go.
