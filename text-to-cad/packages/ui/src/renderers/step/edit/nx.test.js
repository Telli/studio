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

// The part as the engine reads it: each feature gives its first line as written, and the rows folded
// into one (a profile's line, a cut joined to it) give theirs.
const SOURCE = {
  profile: "profile = Circle(RADIUS)", base: "base = extrude(profile, amount=HEIGHT)", blend: "base = fillet(base.edges(), radius=WALL)",
  chamfer: "base = chamfer(base.edges(), length=1)", hole: "base -= Pos(0, 0, 0) * Cylinder(HOLE, HEIGHT)",
};
const SOURCED = featureTree({
  rows: [
    { key: "servo.py:11", file: "servo.py", line: 11, code: SOURCE.profile },
    { key: "servo.py:12", file: "servo.py", line: 12, code: SOURCE.base },
    { key: "servo.py:24", file: "servo.py", line: 24, code: SOURCE.blend },
    { key: "servo.py:25", file: "servo.py", line: 25, code: SOURCE.chamfer },
    { key: "servo.py:27", file: "servo.py", line: 27, code: SOURCE.hole },
  ],
  features: [
    { key: "servo.py:12", kind: "Boss-Extrude", name: "base", file: "servo.py", line: 12, text: SOURCE.base, rows: ["servo.py:11", "servo.py:12"] },
    { key: "servo.py:24", kind: "Fillet", name: "base", file: "servo.py", line: 24, text: SOURCE.blend },
    { key: "servo.py:25", kind: "Chamfer", name: "base", file: "servo.py", line: 25, text: SOURCE.chamfer },
    { key: "servo.py:27", kind: "Hole", name: "base", file: "servo.py", line: 27, text: SOURCE.hole },
  ],
});
// Where the engine says the script stopped: its file as the history names it, its line, and the line as read.
const stoppedAt = (line, text, file = "servo.py") => ({ file, line, text });
const FILLET_FAILED = traceback(TRACER, ["/work/servo/servo.py", 24, SOURCE.blend], KERNEL);

test("a failed build marks the feature whose line it stopped at, told by file, number and words, and says why", () => {
  assert.deepEqual(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(24, SOURCE.blend)), { id: "servo.py:24", why: WHY });
  // A line folded into a feature, its profile's, is the feature's.
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(11, SOURCE.profile))?.id, "servo.py:12");
  // The files are told by their names, whichever way a system writes its paths.
  const nested = featureTree({ features: [{ key: "parts/servo.py:24", kind: "Fillet", name: "base", file: "parts/servo.py", line: 24, text: SOURCE.blend }] });
  assert.equal(buildFailure(nested, FILLET_FAILED, stoppedAt(24, SOURCE.blend, "parts\\servo.py"))?.id, "parts/servo.py:24");
});

test("a line that moved marks nothing: not its own row, and not the neighbour now at its number", () => {
  // A line was written above the fillet: it stands at 25 now, where the last good part's chamfer was.
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(25, SOURCE.blend)), null);
  // Two lines above it, where the last good part had nothing at all.
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(26, SOURCE.blend)), null);
  // The fillet's number with the chamfer's words.
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(24, SOURCE.chamfer)), null);
});

test("a line the last good part does not hold marks nothing, whatever sits at its number", () => {
  // Rewritten (the radius typed over in the line) or new: no row of the last good part reads so.
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(24, "base = fillet(base.edges(), radius=40)")), null);
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(25, "base = shell(base, thickness=1)")), null);
  // The same words at the same number in another file are another line.
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(24, SOURCE.blend, "helpers.py")), null);
  // Nothing to tell it by.
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(24, "")), null);
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, { file: "servo.py", text: SOURCE.blend }), null);
  assert.equal(buildFailure({ assembly: false, features: [] }, FILLET_FAILED, stoppedAt(24, SOURCE.blend)), null);
});

test("features whose lines read alike are told by their numbers, and a line two features stand for marks neither", () => {
  const twice = featureTree({
    features: [
      { key: "servo.py:24", kind: "Fillet", name: "base", file: "servo.py", line: 24, text: SOURCE.blend },
      { key: "servo.py:30", kind: "Fillet", name: "base", file: "servo.py", line: 30, text: SOURCE.blend },
    ],
  });
  assert.equal(buildFailure(twice, FILLET_FAILED, stoppedAt(30, SOURCE.blend))?.id, "servo.py:30");
  assert.equal(buildFailure(twice, FILLET_FAILED, stoppedAt(24, SOURCE.blend))?.id, "servo.py:24");
  assert.equal(buildFailure(twice, FILLET_FAILED, stoppedAt(27, SOURCE.blend)), null);
  // A line both claim cannot say which of them it is.
  const shared = featureTree({
    rows: [{ key: "servo.py:3", file: "servo.py", line: 3, code: SOURCE.profile }],
    features: [
      { key: "servo.py:5", kind: "Boss-Extrude", name: "a", file: "servo.py", line: 5, text: SOURCE.base, rows: ["servo.py:3", "servo.py:5"] },
      { key: "servo.py:9", kind: "Boss-Extrude", name: "b", file: "servo.py", line: 9, text: SOURCE.base, rows: ["servo.py:3", "servo.py:9"] },
    ],
  });
  assert.equal(buildFailure(shared, FILLET_FAILED, stoppedAt(3, SOURCE.profile)), null);
  assert.equal(buildFailure(shared, FILLET_FAILED, stoppedAt(9, SOURCE.base))?.id, "servo.py:9");
});

test("an engine that says no line marks nothing, though the traceback holds a frame", () => {
  // A script that does not parse never ran, so the engine finds no line of the part's own to name, though
  // its traceback names one. An engine that says nothing of where leaves only that traceback's line number,
  // the failing script's, which the last good part's rows stop matching once a line is written above.
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, null), null);
  assert.equal(buildFailure(SOURCED, FILLET_FAILED), null);
});

test("says why in the last line of the traceback the tracer gives for a fillet that cannot be made", () => {
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
    `    ${SOURCE.blend}`,
    '  File "/work/packages/cadgen/src/cadgen/edit/tracer.py", line 431, in wrapper',
    "    result = original(*args, **kwargs)",
    '  File "/work/.venv/lib/python3.13/site-packages/build123d/topology/three_d.py", line 371, in fillet',
    "    raise ValueError(",
    "    ...<2 lines>...",
    "ValueError: Failed creating a fillet with radius of 50, try a smaller value or use max_fillet() to find the largest valid fillet radius",
  ].join("\n");
  assert.deepEqual(buildFailure(SOURCED, error, stoppedAt(24, SOURCE.blend)), {
    id: "servo.py:24", why: "ValueError: Failed creating a fillet with radius of 50, try a smaller value or use max_fillet() to find the largest valid fillet radius" });
});

test("says nothing of an error that points at no feature", () => {
  // A refusal in words: the engine names no line of it.
  assert.equal(buildFailure(SOURCED, "Another feature is named Lid. Pick another name."), null);
  assert.equal(buildFailure(SOURCED, "Another feature is named Lid. Pick another name.", null), null);
  // No error to say, whatever place is held.
  assert.equal(buildFailure(SOURCED, "", stoppedAt(24, SOURCE.blend)), null);
  assert.equal(buildFailure(SOURCED, undefined, stoppedAt(24, SOURCE.blend)), null);
  // A line that makes no feature, and a file the part does not have.
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(99, "x = 1")), null);
  assert.equal(buildFailure(SOURCED, FILLET_FAILED, stoppedAt(24, SOURCE.blend, "notservo.py")), null);
});

test("a failed build in an assembly points at the part's feature, by its file", () => {
  const assembly = featureTree({
    rows: [{ key: "tray.py:7", file: "tray.py", line: 7, code: "tray = extrude(base, amount=3)" }, { key: "lid.py:7", file: "lid.py", line: 7, code: "lid = extrude(base, amount=3)" }],
    components: [
      { file: "tray.py", name: "tray", features: [{ key: "tray.py:7", kind: "Boss-Extrude", name: "tray", file: "tray.py", line: 7, text: "tray = extrude(base, amount=3)" }] },
      { file: "lid.py", name: "lid", features: [{ key: "lid.py:7", kind: "Boss-Extrude", name: "lid", file: "lid.py", line: 7, text: "lid = extrude(base, amount=3)" }] },
    ],
  });
  // The same line number in two parts' files: the file and the words tell them apart.
  assert.equal(buildFailure(assembly, WHY, stoppedAt(7, "lid = extrude(base, amount=3)", "lid.py"))?.id, "lid.py:7");
  assert.equal(buildFailure(assembly, WHY, stoppedAt(7, "tray = extrude(base, amount=3)", "tray.py"))?.id, "tray.py:7");
  assert.equal(buildFailure(assembly, WHY, stoppedAt(7, "tray = extrude(base, amount=3)", "lid.py")), null);
});
