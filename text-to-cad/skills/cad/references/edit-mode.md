# Edit mode

The CAD viewer edits a part by hand while its Python script stays the source. It runs the script,
shows a design tree with the part's named sizes (Parameters) and its history (one feature per
operation the script performs, numbered as a CAD tree numbers them: Extrude1, Fillet1), and draws
the selected feature's dimensions on the model. When the engineer changes a value, the viewer
rewrites that one number in the script, keeping how it was written, and builds again every part
that uses the changed file.

Its ribbon also has modeling commands: Extruded and Revolved Boss/Base, Extruded and Revolved
Cut, Hole, Pattern and Mirror (Create), Fillet, Chamfer and Shell (Modify). Each acts on what the engineer selects (edges or
faces on the model, a sketch or a feature in the history) and writes one line of build123d into
the script, after the statement that makes the part's body, which then reads back as a new feature
of the history.

The engineer also sketches there, as in SolidWorks: Sketch on a plane or a flat face, draw lines,
rectangles, circles, arcs, slots and points, add relations and Smart Dimensions, Exit Sketch, then
extrude or revolve it, as a boss or a cut. Each stroke is a line of `cadgen.sketch` code
([sketching.md](sketching.md)) in the part's script, written as it is drawn; see "Sketches drawn
by hand" below.

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
- **Extruded Boss/Base and Extruded Cut** make a solid of the sketch selected in the design tree:
  `part += extrude(sketch2.face(), amount=5)`, or `part -= extrude(...)` for a cut (a negative
  amount goes the other way along the sketch's normal; Mid Plane is `both=True` with half the
  depth; a cut Through All is `amount=-part.bounding_box().diagonal`). The line goes after the
  sketch's own lines.
- **Revolved Boss/Base and Revolved Cut** turn the selected sketch about one of its lines (its
  centerline, usually): `part += revolve(sketch2.face(), axis=sketch2.axis(line1),
  revolution_arc=360)`, or `part -= revolve(...)` for a cut; Reverse direction is a negative
  angle.
- Sizes are written in the project's units, as the file writes them (`.03*INCH` in an inch part).
- A line that does not run, or does not make the feature on what was selected, is not written.
- **Delete** (the key, or a feature's menu in the design tree) takes a feature's lines out of the
  script; the sketch it was made from stays. A line that changes the body in place goes whole
  (`part += ...`, `tray = bd.fillet(tray...)`); a boolean that starts a name keeps the name as the
  body it was made from (`tray = outer - cavity` becomes `tray = outer`, and `cavity`'s line goes);
  a loop goes whole when every line in it is the feature's. A feature whose name a later line
  still uses is not deleted: the engineer is told which feature uses it. A sketch of its own goes
  with its lines.
- **Edit Feature** (a feature's menu, or a double-click on it) reopens the command that wrote the
  feature's line, with its values, and writes that same line again in its place. What the line
  acts on stays as written (its edges, faces, the feature it copies, its sketch), and a value
  left as it was keeps how it was written (`radius=WALL` stays `radius=WALL`). A line written in
  the commands' form opens this way even when you wrote it.
- **Suppress** takes a feature out of the part but keeps its lines, as comments under a line that
  says what they are; Unsuppress puts them back exactly. A boolean that starts a name keeps the
  name meanwhile, on a line of its own:

  ```python
      # Suppressed (Cut-Extrude, 2 lines):
      # cavity = Pos(0, 0, 2) * Box(36, 16, 10)
      # tray = outer - cavity
      tray = outer  # Cut-Extrude suppressed
  ```

  The design tree shows the feature greyed where its lines are, with its sketch under it. Leave
  such a block as it is. If you must change a suppressed line, keep it commented and keep the count
  on the first line right, or Unsuppress cannot put it back. A feature a later line still uses is
  not suppressed, as with Delete.

## Sketches drawn by hand

- A new sketch is a line before the part is returned: `sketch2 = Sketch("Sketch2", plane="Top")`
  (on a face of the body: `plane=part.faces().sort_by(Axis.Z)[-1]`; in an inch part, `unit=INCH`).
- Each stroke, relation and dimension is one more line at the end of the sketch's own lines,
  the entities named as the sketch names them where the name is free (`line1, line2, line3, line4
  = sketch2.rectangle(sketch2.origin, (30, 20))`, `sketch2.length(line1, 30)`). A point drawn on
  another sketch's point shares it (`line5 = sketch2.line(line4.end, ...)`); one drawn on a curve
  is held to it (`sketch2.coincident(...)`); a line drawn level or plumb gets `horizontal` or
  `vertical`.
- After each change the drawn coordinates are written where the sketch solved them, so the lines
  read as the sketch stands: a dimension of 30 turns `(14.32, 8.8)` into `(30, 8.8)`.
- Deleting an entity takes out its line and the relations and dimensions on it; a curve drawn
  from one of its points keeps the point where it was. A corner rectangle's line is deleted on its
  own: the rectangle is written as its four lines first.
- The sketch tools write lines too. Sketch Fillet writes `sketch2.fillet(line2, line3, 2)`.
  Offset Entities draws the offset curves where they fall and holds them with
  `sketch2.offset_entities([line9, ...], [line1, ...], 2)`. Mirror Entities draws the mirrored
  curves, shares the points on the centerline, and holds the rest with `sketch2.symmetric(...)`
  (and `sketch2.equal(...)` for an arc or circle). Trim Entities moves an end back to where
  another curve crosses (`sketch2.coincident(line1.end, line2)` keeps it there), splits a line
  or an arc in two (kept in line: `parallel` and `coincident`, or `equal` for an arc; a split
  line's length becomes the distance between its far ends), or makes a circle an arc; a
  rectangle is written as its four lines first. A curve nothing crosses is deleted.
- Keep this shape when you change a sketch the engineer drew: its block of lines after the
  `Sketch(...)` line, entities assigned to names, so the engineer can open it again with Edit
  Sketch. Change sizes by their numbers or names, as in any sketch.

## Hand edits

- A hand edit is an ordinary edit to the script. The engineer's next message carries a note of
  each one ("In edit mode I changed Length (LENGTH) from 2.80 to 3.00 (parts/sizes.py, line 8).",
  "In edit mode I added Fillet2, radius 0.03 in, 1 edge (parts/housing_geometry.py, line 37).",
  "In edit mode I deleted Fillet1 (parts/housing_geometry.py, line 31).", "In edit mode I changed
  Fillet2 to radius 0.05 in, 1 edge (...)." for Edit Feature, "In edit mode I suppressed Fillet1:
  its lines are comments now (...).").
  A sketch is told once, when the engineer leaves it ("In edit mode I drew Sketch2 on the Top
  Plane (parts/plate.py, line 13): drew 4 lines and a circle, added 5 dimensions.").
- A command's line is the engineer's: keep it, and keep its selector unless a change you make
  moves what it selects (then say so, and propose the new selector).
- Read the script again before you change it, and keep their values unless they ask.
- Do not rebuild or recheck because they edited something: the viewer already rebuilt the parts
  that use the file.
- When a check fails, propose the change (which size, to what, and why) and wait for a go.
