import assert from "node:assert/strict";
import test from "node:test";

import { EDIT_COMMANDS, featureTree } from "./editMode.js";
import { SOLID_GROUPS, booleanOf, buildFailure, navigatorLabel, navigatorTitles, workspaceTabs } from "./nx.js";

const titles = options => workspaceTabs(options).map(tab => tab.title);

test("lists Solid, Sketch and Inspect, and Assemble only in an assembly", () => {
  assert.deepEqual(titles({ assembly: false, sketching: false, drawing: false }), ["Solid", "Sketch", "Inspect"]);
  assert.deepEqual(titles({ assembly: true, sketching: false, drawing: false }), ["Solid", "Sketch", "Inspect", "Assemble"]);
  assert.deepEqual(workspaceTabs({ assembly: true, sketching: false, drawing: false }).map(tab => tab.id), ["solid", "sketch", "inspect", "assemble"]);
});

test("keeps Drafting where the drawing's commands are, after the rest", () => {
  assert.deepEqual(titles({ assembly: false, sketching: false, drawing: true }), ["Solid", "Sketch", "Inspect", "Drafting"]);
  assert.deepEqual(titles({ assembly: true, sketching: false, drawing: true }), ["Solid", "Sketch", "Inspect", "Assemble", "Drafting"]);
});

test("a sketch being edited has the Sketch tab alone, as the sketch task environment has", () => {
  assert.deepEqual(workspaceTabs({ assembly: true, sketching: true, drawing: true }), [{ id: "sketch", title: "Sketch" }]);
});

test("puts every modeling command in one group", () => {
  // A subtracting command (Extruded Cut...) is reached by its unite command's Boolean, so it has no place of its own.
  const modeling = EDIT_COMMANDS.filter(({ id }) => booleanOf(id)?.value !== "subtract").map(({ id }) => id);
  const placed = SOLID_GROUPS.flatMap(group => group.items).filter(item => EDIT_COMMANDS.some(({ id }) => id === item));
  assert.deepEqual([...placed].sort(), [...modeling].sort());
  assert.equal(new Set(placed).size, placed.length);
});

test("each group holds only what the toolbar can draw, and shows some of it as buttons", () => {
  const drawn = new Set([...EDIT_COMMANDS.map(({ id }) => id), "sketch", "measure", "clip", "references", "ask", "add-context", "annotate"]);
  assert.deepEqual(SOLID_GROUPS.map(group => group.title), ["Create", "Modify", "Construct", "Inspect", "Select", "Ask the agent"]);
  for (const group of SOLID_GROUPS) {
    for (const item of group.items) assert.ok(drawn.has(item), `${group.title} holds "${item}", which the toolbar has no button for`);
    assert.ok(group.shown >= 1 && group.shown <= group.items.length, `${group.title} shows ${group.shown} of ${group.items.length}`);
  }
});

// The demo's part, as the engine reads it from its script: two extrudes with their sketches, an Edge
// Blend, a Hole and a Pattern Feature. The Part Navigator numbers it after the datum coordinate
// system (0): Sketch (1), Extrude (2), Sketch (3), Extrude (4) "upright", Edge Blend (5), Hole (6),
// Pattern Feature (7).
const DEMO = featureTree({
  features: [
    { key: "servo.py:12", kind: "Boss-Extrude", name: "base", file: "servo.py", line: 12,
      sketch: { name: "SKETCH_000", plane: "Top", file: "servo.py", line: 10, status: "Fully defined" } },
    { key: "servo.py:20", kind: "Boss-Extrude", name: "wall", file: "servo.py", line: 20, named: "upright",
      sketch: { name: "SKETCH_001", plane: "Front", file: "servo.py", line: 18, status: "Fully defined" } },
    { key: "servo.py:24", kind: "Fillet", name: "wall", file: "servo.py", line: 24 },
    { key: "servo.py:27", kind: "Hole", name: "wall", file: "servo.py", line: 27 },
    { key: "servo.py:30", kind: "Pattern", name: "wall", file: "servo.py", line: 30 },
  ],
}).features;
const [BASE, WALL, BLEND, HOLE, PATTERN] = DEMO;

test("numbers the Part Navigator's rows after the datum coordinate system, a feature's sketch just before it", () => {
  assert.deepEqual([...navigatorTitles(DEMO)], [
    [BASE.sketch.id, 'Sketch (1) "SKETCH_000"'],
    [BASE.id, "Extrude (2)"],
    [WALL.sketch.id, 'Sketch (3) "SKETCH_001"'],
    [WALL.id, 'Extrude (4) "upright"'],
    [BLEND.id, "Edge Blend (5)"],
    [HOLE.id, "Hole (6)"],
    [PATTERN.id, "Pattern Feature (7)"],
  ]);
});

test("names a row as the Part Navigator does without the name it was given", () => {
  assert.equal(navigatorLabel(DEMO, HOLE.id), "Hole (6)");
  // The same number a title has, minus the quoted name.
  assert.equal(navigatorLabel(DEMO, WALL.id), "Extrude (4)");
  assert.equal(navigatorLabel(DEMO, WALL.sketch.id), "Sketch (3)");
  assert.equal(navigatorLabel(DEMO, BLEND.id), "Edge Blend (5)");
  // A row the Part Navigator does not list has no label, so a caller can keep its own words.
  assert.equal(navigatorLabel(DEMO, "servo.py:99"), "");
  assert.equal(navigatorLabel([], HOLE.id), "");
});

test("a sketch that is a row of its own is numbered like the rest", () => {
  const features = featureTree({
    features: [
      { key: "lid.py:5", kind: "Sketch", file: "lid.py", line: 5, sketch: { name: "Outline", plane: "Top", file: "lid.py", line: 5, status: "Fully defined" } },
      { key: "lid.py:9", kind: "Boss-Extrude", name: "lid", file: "lid.py", line: 9 },
    ],
  }).features;
  assert.equal(navigatorLabel(features, features[0].id), "Sketch (1)");
  assert.equal(navigatorTitles(features).get(features[0].id), 'Sketch (1) "Outline"');
  assert.equal(navigatorLabel(features, features[1].id), "Extrude (2)");
});

// What a part's script stops with: the tracer's frame, the part's own line, build123d's, then the error.
const traceback = (...frames) => ["Traceback (most recent call last):", ...frames.flatMap(([file, line, code]) => [
  `  File "${file}", line ${line}, in part`, `    ${code}`]), "OCP.StdFail.StdFail_NotDone: BRep_API: command not done"].join("\n");
const TRACER = ["/work/.venv/lib/python3.13/site-packages/cadgen/edit/tracer.py", 1660, "shape = model.func()"];
const KERNEL = ["/work/.venv/lib/python3.13/site-packages/build123d/operations_generic.py", 541, "return Solid.fillet(...)"];
const WHY = "OCP.StdFail.StdFail_NotDone: BRep_API: command not done";

test("a failed build marks the feature at the line its error points at, and says why", () => {
  const error = traceback(TRACER, ["/work/servo/servo.py", 24, "part = fillet(part.edges(), radius=40)"], KERNEL);
  assert.deepEqual(buildFailure({ assembly: false, features: DEMO }, error), { id: BLEND.id, why: WHY });
  // Windows writes its paths the other way round.
  assert.equal(buildFailure({ assembly: false, features: DEMO }, traceback(["C:\\work\\servo\\servo.py", 27, "hole(...)"], KERNEL))?.id, HOLE.id);
});

test("reads the traceback the tracer gives for a fillet that cannot be made", () => {
  // A real one, its paths shortened: build123d's error, then a second traceback chained to it that holds
  // the part's own line, past the tracer's frame and under build123d's wrapper.
  const error = [
    "Traceback (most recent call last):",
    '  File "/work/.venv/lib/python3.13/site-packages/build123d/topology/three_d.py", line 367, in fillet',
    "    new_shape = self._make_3d_result(fillet_builder.Shape())",
    "OCP.OCP.Standard.Standard_Failure: BRep_API: command not done",
    "",
    "The above exception was the direct cause of the following exception:",
    "",
    "Traceback (most recent call last):",
    '  File "/work/packages/cadgen/src/cadgen/edit/tracer.py", line 1668, in trace',
    "    shape = model.func()",
    '  File "/work/servo/servo.py", line 24, in servo',
    "    outer = fillet(outer.edges().filter_by(Axis.Z), radius=RADIUS)",
    '  File "/work/packages/cadgen/src/cadgen/edit/tracer.py", line 431, in wrapper',
    "    result = original(*args, **kwargs)",
    '  File "/work/.venv/lib/python3.13/site-packages/build123d/topology/three_d.py", line 371, in fillet',
    "    raise ValueError(",
    "    ...<2 lines>...",
    "ValueError: Failed creating a fillet with radius of 50, try a smaller value or use max_fillet() to find the largest valid fillet radius",
  ].join("\n");
  assert.deepEqual(buildFailure({ assembly: false, features: DEMO }, error), {
    id: BLEND.id, why: "ValueError: Failed creating a fillet with radius of 50, try a smaller value or use max_fillet() to find the largest valid fillet radius" });
});

test("a failed build points at the feature whose lines it stopped in, its sketch's and a cut folded into it too", () => {
  const folded = featureTree({
    features: [
      { key: "box.py:6", kind: "Boss-Extrude", name: "box", file: "box.py", line: 6, rows: ["box.py:5", "box.py:6", "box.py:8"],
        sketch: { name: "Outline", plane: "Top", file: "box.py", line: 5, status: "Fully defined" } },
      { key: "box.py:9", kind: "Fillet", name: "box", file: "box.py", line: 9 },
    ],
  });
  const at = line => buildFailure(folded, traceback(TRACER, ["/work/box.py", line, "..."]))?.id;
  assert.equal(at(8), "box.py:6");
  assert.equal(at(5), "box.py:6");
  assert.equal(at(9), "box.py:9");
});

test("a failed build points at the part's own frame that makes a feature, the deepest one first", () => {
  const tree = { assembly: false, features: DEMO };
  // A helper the part calls fails: its frame makes no feature, so the call in the part's script is the row.
  const helper = traceback(TRACER, ["/work/servo/servo.py", 27, "hole = drill(part)"], ["/work/servo/helpers.py", 8, "raise ValueError"]);
  assert.equal(buildFailure(tree, helper)?.id, HOLE.id);
  // Both frames make features: the one it stopped in.
  const both = traceback(TRACER, ["/work/servo/servo.py", 24, "a"], ["/work/servo/servo.py", 27, "b"]);
  assert.equal(buildFailure(tree, both)?.id, HOLE.id);
});

test("says nothing of an error that points at no feature", () => {
  const tree = { assembly: false, features: DEMO };
  // No traceback: a refusal in words.
  assert.equal(buildFailure(tree, "Another feature is named Lid. Pick another name."), null);
  assert.equal(buildFailure(tree, ""), null);
  assert.equal(buildFailure(tree, undefined), null);
  // A line that makes no feature, a file the part does not have, and no part to point in.
  assert.equal(buildFailure(tree, traceback(TRACER, ["/work/servo/servo.py", 99, "x"])), null);
  assert.equal(buildFailure(tree, traceback(TRACER, ["/work/notservo.py", 24, "x"])), null);
  assert.equal(buildFailure({ assembly: false, features: [] }, traceback(TRACER, ["/work/servo/servo.py", 24, "x"])), null);
});

test("a failed build in an assembly points at the part's feature, by its file", () => {
  const assembly = featureTree({
    components: [
      { file: "tray.py", name: "tray", features: [{ key: "tray.py:7", kind: "Boss-Extrude", name: "tray", file: "tray.py", line: 7 }] },
      { file: "lid.py", name: "lid", features: [{ key: "lid.py:7", kind: "Boss-Extrude", name: "lid", file: "lid.py", line: 7 }] },
    ],
  });
  assert.equal(buildFailure(assembly, traceback(TRACER, ["/work/lid.py", 7, "x"]))?.id, "lid.py:7");
  assert.equal(buildFailure(assembly, traceback(TRACER, ["/work/tray.py", 7, "x"]))?.id, "tray.py:7");
});
