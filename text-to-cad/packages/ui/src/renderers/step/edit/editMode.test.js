import assert from "node:assert/strict";
import test from "node:test";

import {
  barIndex,
  buildingText,
  clickOffsets,
  busyState,
  changeNote,
  changesSince,
  chooseLine,
  chooseSteps,
  commandBlocked,
  commandDefaults,
  commandNote,
  commandRequest,
  edgeAxis,
  extrudeEnd,
  partSide,
  patternAxis,
  commandUndoNote,
  defaultRow,
  deleteNote,
  deleteRefusal,
  editingValues,
  emptyHistory,
  faceOffsetAxes,
  featureNames,
  featureTree,
  formulaWords,
  recordChange,
  redoStep,
  restates,
  rolledBack,
  sameValues,
  selectionItems,
  selectionLabel,
  sizeName,
  suppressNote,
  undoStep,
  withUnit
} from "./editMode.js";

test("a size reads as an engineer says it", () => {
  assert.equal(sizeName("TRAY_HEIGHT"), "Tray height");
  assert.equal(sizeName("wallThickness"), "Wall thickness");
  assert.equal(sizeName("PCB_OD"), "PCB OD");
  assert.equal(sizeName(".060"), ".060");
  assert.equal(withUnit(".060", "in"), ".060 in");
  assert.equal(withUnit("45", ""), "45");
});

test("the history is numbered as a CAD tree numbers it, the script's names beside", () => {
  const names = featureNames([
    { key: "a", kind: "Extrude", name: "outer" },
    { key: "b", kind: "Fillet", name: "outer" },
    { key: "c", kind: "Extrude", name: "cavity" },
    { key: "d", kind: "Join", name: null },
  ]);
  assert.deepEqual(names.map(name => [name.title, name.name]), [["Extrude1", "Outer"], ["Fillet1", "Outer"], ["Extrude2", "Cavity"], ["Combine1", ""]]);
});

test("edit mode opens on the first feature that draws dimensions", () => {
  const state = { rows: [{ key: "a" }, { key: "b" }], dimensions: [{ id: "1", row: "b" }] };
  assert.equal(defaultRow(state), "b");
  assert.equal(defaultRow({ rows: [{ key: "a" }], dimensions: [] }), "a");
  assert.equal(defaultRow(null), null);
});

test("a formula reads in words, and one that only restates its value is not shown twice", () => {
  assert.equal(formulaWords("LENGTH-2*WALL"), "Length - 2 × Wall");
  assert.ok(restates("20", "20"));
  assert.ok(!restates("LENGTH-2*WALL", "2.68"));
});

test("a hand change's note says what changed and where", () => {
  assert.equal(changeNote({ name: "LENGTH", from: "2.80", to: "3.00", file: "parts/housing_geometry.py", line: 8 }),
    "In edit mode I changed Length (LENGTH) from 2.80 to 3.00 (parts/housing_geometry.py, line 8).");
});

test("a build in progress says how far it has got", () => {
  assert.equal(buildingText({ scripts: ["a.py", "b.py"], done: 1, error: null }), "Updating STEP files, 1 of 2");
  assert.equal(buildingText({ scripts: ["a.py"], done: 1, error: null }), "");
  assert.equal(buildingText({ scripts: ["a.py"], done: 1, error: "a.py: failed" }), "A STEP file did not rebuild");
});

test("undo writes a change's number back, and redo writes it again", () => {
  const change = { literal: "sizes.py:2:8", from: "20", to: "25" };
  let history = recordChange(emptyHistory(), change);
  const undo = undoStep(history);
  assert.deepEqual(undo.request, { literal: "sizes.py:2:8", text: "20" });
  history = undo.next;
  assert.equal(undoStep(history), null);
  const redo = redoStep(history);
  assert.deepEqual(redo.request, { literal: "sizes.py:2:8", text: "25" });
  // A new change after an undo leaves nothing to redo.
  assert.equal(redoStep(recordChange(history, { literal: "x", from: "1", to: "2" })), null);
});

test("a delete the server refuses names the features that use what it makes", () => {
  const tree = featureTree({ features: [
    { key: "tray.py:7", kind: "Boss-Extrude", rows: ["tray.py:7"], file: "tray.py", line: 7, name: "outer" },
    { key: "tray.py:8", kind: "Fillet", rows: ["tray.py:8"], file: "tray.py", line: 8, name: "outer" },
    { key: "tray.py:9", kind: "Cut-Extrude", rows: ["tray.py:9", "tray.py:10"], file: "tray.py", line: 9, name: "cavity" },
  ] });
  const refused = { ok: false, error: "Boss-Extrude1 makes outer, which line 8 still uses.", dependents: { name: "outer", lines: [8, 10], file: "tray.py" } };
  assert.equal(deleteRefusal(refused, tree, "Boss-Extrude1"), "Boss-Extrude1 is used by Fillet1 and Cut-Extrude1. Delete them first, or ask the agent.");
  // Lines no feature holds: the server's own words.
  assert.equal(deleteRefusal({ ...refused, dependents: { name: "outer", lines: [40], file: "tray.py" } }, tree, "Boss-Extrude1"), refused.error);
  const change = { kind: "delete", title: "Fillet1", file: "tray.py", line: 8 };
  assert.equal(deleteNote(change), "In edit mode I deleted Fillet1 (tray.py, line 8).");
  assert.equal(deleteNote(change, { undo: true }), "In edit mode I put back Fillet1 (tray.py, line 8).");
});

test("the rollback bar greys what is below it, and sits past the last item when rolled forward", () => {
  const tree = featureTree({ features: [
    { key: "tray.py:7", kind: "Boss-Extrude", rows: ["tray.py:7"], file: "tray.py", line: 7, name: "outer" },
    { key: "tray.py:8", kind: "Fillet", rows: ["tray.py:8"], file: "tray.py", line: 8, name: "outer" },
    { key: "tray.py:9", kind: "Cut-Extrude", rows: ["tray.py:9", "tray.py:10"], file: "tray.py", line: 9, name: "cavity" },
  ] });
  assert.equal(barIndex(tree, null), 3);
  assert.deepEqual([...rolledBack(tree, null)], []);
  const bar = { before: "tray.py:8", item: "tray.py:8", step: "/cache/tray.step" };
  assert.equal(barIndex(tree, bar), 1);
  assert.deepEqual([...rolledBack(tree, bar)], ["tray.py:8", "tray.py:9"]);
  // A bar whose item is gone (the agent changed the file) is past the last item.
  assert.equal(barIndex(tree, { ...bar, item: "tray.py:40" }), 3);
});

test("a suppressed feature stays in the tree, and its note says its lines are comments", () => {
  const tree = featureTree({ features: [
    { key: "tray.py:7", kind: "Boss-Extrude", rows: ["tray.py:7"], file: "tray.py", line: 7, name: "outer" },
    { key: "suppressed@tray.py:8", kind: "Fillet", rows: [], file: "tray.py", line: 8, name: "outer", suppressed: true },
    { key: "tray.py:10", kind: "Fillet", rows: ["tray.py:10"], file: "tray.py", line: 10, name: "outer" },
  ] });
  // Numbered with the rest, so a feature keeps its title while it is suppressed.
  assert.deepEqual(tree.features.map(f => [f.title, f.suppressed]), [["Boss-Extrude1", false], ["Fillet1", true], ["Fillet2", false]]);
  const change = { kind: "suppress", on: true, title: "Fillet1", file: "tray.py", line: 8 };
  assert.equal(suppressNote(change), "In edit mode I suppressed Fillet1: its lines are comments now (tray.py, line 8).");
  assert.equal(suppressNote(change, { undo: true }), "In edit mode I unsuppressed Fillet1: its lines are back (tray.py, line 8).");
  assert.equal(suppressNote({ ...change, on: false }, { redo: true }), "In edit mode I unsuppressed Fillet1 again: its lines are back (tray.py, line 8).");
  const refused = { ok: false, error: "", dependents: { name: "outer", lines: [10], file: "tray.py" } };
  assert.equal(deleteRefusal(refused, tree, "Boss-Extrude1", "Suppress"), "Boss-Extrude1 is used by Fillet2. Suppress it first, or ask the agent.");
});

test("Edit Feature opens a command with the feature's values and writes its line again", () => {
  const editing = { id: "a.py:9", title: "Fillet1", command: "fillet", values: { radius: ".05" }, keeps: "4 edges" };
  const opened = editingValues(editing, "in");
  assert.deepEqual(opened, { radius: ".05" });
  assert.ok(sameValues({ radius: " .05" }, opened));
  assert.ok(!sameValues({ radius: ".06" }, opened));
  // What the feature acts on stays as it is unless edges are picked again (on the body before it),
  // so none is waited for.
  const items = selectionItems([EDGE]);
  assert.deepEqual(commandRequest("fillet", { radius: ".06" }, [], null, null, editing),
    { command: "fillet", selection: [], inputs: { radius: ".06" }, replace: { row: "a.py:9" } });
  assert.deepEqual(commandRequest("fillet", { radius: ".06" }, items, null, null, editing).selection, items);
  assert.equal(commandBlocked("fillet", [], null, {}, editing), "");
  const [face] = selectionItems([FACE]);
  assert.equal(commandBlocked("hole", [face, { ...face, selector: "f2" }], null, {}, { ...editing, command: "hole" }), "Select one face.");
  const sketch = { file: "a.py", line: 4, title: "Sketch1", constrained: true };
  assert.deepEqual(commandRequest("extrude", { end: "mid", depth: "8", reverse: false }, [], null, sketch, { ...editing, command: "extrude" }), {
    command: "extrude", sketch: { file: "a.py", line: 4, name: "Sketch1" }, inputs: { end: "mid", depth: "8", reverse: false },
    replace: { row: "a.py:9" },
  });
  const change = { kind: "command", edited: true, feature: "Fillet", what: "4 edges", inputs: [{ label: "Radius", display: "0.06", unit: "in" }],
    file: "a.py", line: 9 };
  assert.equal(commandNote(change, "Fillet1"), "In edit mode I changed Fillet1 to radius 0.06 in, 4 edges (a.py, line 9).");
  assert.equal(commandUndoNote(change, "Fillet1", false), "In edit mode I put Fillet1 back as it was (a.py, line 9).");
  assert.equal(commandUndoNote(change, "Fillet1", true), "In edit mode I changed Fillet1 again (a.py, line 9).");
});

test("a sketch session's changes are counted from the change before it, past the history's limit", () => {
  const before = { literal: "a", from: "1", to: "2" };
  let history = recordChange(emptyHistory(), before);
  assert.equal(changesSince(history, before), 0);
  for (let stroke = 0; stroke < 60; stroke += 1) history = recordChange(history, { undo: { hunks: [] }, stroke });
  // The history keeps its last 50 changes: all of them the session's once `before` has gone.
  assert.equal(changesSince(history, before), 50);
  assert.equal(changesSince(recordChange(recordChange(emptyHistory(), before), { stroke: 0 }), before), 1);
  assert.equal(changesSince(recordChange(emptyHistory(), { stroke: 0 }), null), 1);
});

// The viewer's references for a face and an edge, as the selector runtime hands them over.
const EDGE = { selectorType: "edge", displaySelector: "e3", pickData: { curveType: "line", center: [0, 5, 2], length: 20 } };
const FACE = { selectorType: "face", displaySelector: "f1", pickData: { surfaceType: "plane", center: new Float32Array([0, 0, 2]), area: 200 } };

test("a selection is each face and edge by its selector, with what the viewer read of it", () => {
  const items = selectionItems([EDGE, FACE, { selectorType: "occurrence", displaySelector: "o1" }]);
  assert.deepEqual(items, [
    { selector: "e3", type: "line", center: [0, 5, 2], size: 20 },
    { selector: "f1", type: "plane", center: [0, 0, 2], size: 200 },
  ]);
  assert.deepEqual(items.map(selectionLabel), ["Edge 3", "Face 1"]);
});

test("a command sends what it acts on, its inputs as typed, and the feature it copies", () => {
  const items = selectionItems([EDGE, FACE]);
  assert.deepEqual(commandRequest("fillet", { radius: ".03" }, items, { row: "a.py:4" }),
    { command: "fillet", selection: items, inputs: { radius: ".03" } });
  // A hole takes the face alone, through all unless a depth is set, moved only where it is told.
  const hole = commandRequest("hole", { ...commandDefaults("hole", "in"), y: ".2" }, items);
  assert.deepEqual([hole.selection, hole.inputs], [[items[1]], { diameter: ".125", depth: "", y: ".2" }]);
  assert.equal(commandRequest("hole", { ...commandDefaults("hole", "mm"), through: false }, items).inputs.depth, "5");
  assert.deepEqual(commandRequest("pattern", { type: "linear", direction: "Y", spacing: "10", count: "3", reverse: true }, items,
    { row: "a.py:4", name: "Hole1" }), {
    command: "pattern", selection: [], inputs: { type: "linear", count: "3", direction: "Y", spacing: "-(10)" },
    feature: { row: "a.py:4", name: "Hole1" },
  });
  assert.deepEqual(commandRequest("mirror", commandDefaults("mirror", "mm"), [], null), { command: "mirror", selection: [], inputs: { plane: "YZ" } });
});

test("a command's OK waits for what it acts on", () => {
  const [edge, face] = selectionItems([EDGE, FACE]);
  assert.equal(commandBlocked("fillet", []), "Select edges on the model.");
  assert.equal(commandBlocked("fillet", [edge]), "");
  assert.equal(commandBlocked("hole", [edge]), "Select a flat face on the model.");
  assert.equal(commandBlocked("hole", [face, { ...face, selector: "f2" }]), "Select one face.");
  assert.equal(commandBlocked("shell", [face]), "");
  assert.equal(commandBlocked("mirror", []), "");
  assert.equal(commandBlocked("pattern", []), "");
});

test("Choose names the pick still wanted, in order, and none once each is made", () => {
  const [edge, face] = selectionItems([EDGE, FACE]);
  const line = (id, picks = {}) => chooseLine(chooseSteps(id, picks));
  assert.equal(line("fillet"), "1 of 1: Select edges to round");
  assert.equal(line("fillet", { listed: [edge] }), null);
  // A reopened feature keeps what it acts on until others are picked.
  assert.equal(line("chamfer", { kept: true }), null);
  assert.equal(line("hole", { listed: [face, { ...face, selector: "f2" }] }), "1 of 1: Select a flat face for the hole");
  // An extrude takes its sketch first, then what an Up To Surface ends on.
  const sketch = { title: "Sketch1" };
  assert.equal(line("extrude", { values: { end: "surface" } }), "1 of 2: Select a sketch");
  assert.equal(line("extrude", { sketch, values: { end: "surface" } }), "2 of 2: Select a flat face to end on");
  assert.equal(line("extrude", { sketch, values: { end: "surface" }, ending: face }), null);
  assert.equal(line("extrude", { sketch, values: { end: "blind" } }), null);
  assert.equal(line("revolve", { sketch, values: { axis: "" } }), "2 of 2: Select a centerline to revolve about");
  // Mirror and Pattern have what they need as they open.
  assert.equal(line("mirror"), null);
  assert.equal(line("pattern"), null);
});

test("a hole moves along the two axes that lie in its face, or all three on a slanted one", () => {
  assert.deepEqual(faceOffsetAxes([0, 0, 1]), ["x", "y"]);
  assert.deepEqual(faceOffsetAxes([-1, 0, 0]), ["y", "z"]);
  assert.deepEqual(faceOffsetAxes([0, -1, 0]), ["x", "z"]);
  assert.deepEqual(faceOffsetAxes([0.6, 0.8, 0]), ["x", "y", "z"], "a slanted face moves its hole in all three");
});

test("a command's note says what was added and where, and Undo takes its lines back", () => {
  const change = { kind: "command", feature: "Fillet", what: "4 edges", inputs: [{ label: "Radius", display: "0.02", unit: "in" }],
    file: "parts/tray.py", line: 37, undo: { file: "parts/tray.py", hunks: [] }, redo: { file: "parts/tray.py", hunks: [] } };
  assert.equal(commandNote(change, "Fillet2"), "In edit mode I added Fillet2, radius 0.02 in, 4 edges (parts/tray.py, line 37).");
  assert.equal(commandUndoNote(change, "Fillet2", false), "In edit mode I removed Fillet2 (parts/tray.py, line 37).");
  assert.equal(commandUndoNote(change, "Fillet2", true), "In edit mode I added Fillet2 again (parts/tray.py, line 37).");
  const history = recordChange(emptyHistory(), change);
  assert.deepEqual(undoStep(history).request, { splice: change.undo });
  assert.deepEqual(redoStep(undoStep(history).next).request, { splice: change.redo });
});

test("the design tree numbers features by kind and sketches in order, as SolidWorks does", async () => {
  const { featureTree, treeIds, selectionDimensions, planeOutline } = await import("./editMode.js");
  const state = {
    features: [
      { key: "p.py:3", kind: "Boss-Extrude", name: "outer", rows: ["p.py:3"], sketch: { op: "RectangleRounded", plane: "Top" } },
      { key: "p.py:4", kind: "Fillet", name: "outer", rows: ["p.py:4"], sketch: null },
      { key: "p.py:5", kind: "Cut-Extrude", name: "cavity", rows: ["p.py:5", "p.py:6"], sketch: { op: "Rectangle", plane: "Top" } },
      { key: "p.py:7", kind: "Boss-Extrude", name: "pad", count: 2, rows: ["p.py:7", "p.py:8"], sketch: { op: "Rectangle", plane: "Top" } },
    ],
    dimensions: [{ id: "1:x", row: "p.py:5" }, { id: "1:z", row: "p.py:5" }, { id: "0:x", row: "p.py:3" }],
  };
  const tree = featureTree(state);
  assert.deepEqual(tree.features.map(f => [f.title, f.name, f.sketch?.title || ""]),
    [["Boss-Extrude1", "Outer", "Sketch1"], ["Fillet1", "Outer", ""], ["Cut-Extrude1", "Cavity", "Sketch2"], ["Boss-Extrude2", "Pad", "Sketch3"]]);
  assert.ok(treeIds(tree).has("plane:Top") && treeIds(tree).has("origin") && treeIds(tree).has("sketch:p.py:5"));
  // A feature draws its sketch's sizes and its depth; its sketch draws the sizes alone.
  assert.deepEqual(selectionDimensions(state, tree, "p.py:5").map(d => d.id), ["1:x", "1:z"]);
  assert.deepEqual(selectionDimensions(state, tree, "sketch:p.py:5").map(d => d.id), ["1:x"]);
  assert.deepEqual(selectionDimensions(state, tree, "plane:Top"), []);
  // The Top plane is a square through the origin on XY, a little larger than the part.
  const top = planeOutline("Top", [[-10, -5, 0], [10, 5, 4]]);
  assert.ok(top.every(([, , z]) => z === 0) && Math.abs(top[2][0] - 11.5) < 1e-9);
});

test("an assembly's tree lists its parts as components, each numbered on its own", async () => {
  const { featureTree } = await import("./editMode.js");
  const tree = featureTree({ components: [
    { name: "daisy_tray", file: "parts/daisy_tray.py", features: [{ key: "h.py:26", kind: "Boss-Extrude", name: "outer", sketch: null }] },
    { name: "daisy_cover", file: "parts/daisy_cover.py", features: [{ key: "h.py:43", kind: "Boss-Extrude", name: "lid", sketch: null }] },
  ] });
  assert.ok(tree.assembly);
  assert.deepEqual(tree.components.map(c => [c.title, c.features[0].title]), [["Daisy tray<1>", "Boss-Extrude1"], ["Daisy cover<1>", "Boss-Extrude1"]]);
});

test("what edit mode is busy with is said, with how far a rebuild has got", () => {
  assert.deepEqual(busyState({ status: "reading" }), { text: "Reading the part", progress: null });
  assert.deepEqual(busyState({ status: "ready", rolling: true }), { text: "Rolling back", progress: null });
  assert.deepEqual(busyState({ status: "ready", saving: true, sketch: {} }), { text: "Solving", progress: null });
  assert.deepEqual(busyState({ status: "ready", saving: true }), { text: "Rebuilding", progress: null });
  const building = { scripts: ["a.py", "b.py", "c.py"], done: 1, error: null };
  assert.deepEqual(busyState({ status: "ready", state: { building } }), { text: "Updating STEP files, 1 of 3", progress: 33 });
  assert.equal(busyState({ status: "ready", state: { building: { ...building, done: 3 } } }), null);
  assert.equal(busyState({ status: "ready", state: { building: { ...building, error: "failed" } } }), null);
});

test("a cut goes toward the part: which side of a sketch's plane the part lies on", () => {
  const bounds = [[-10, -5, 0], [10, 5, 4]];
  const on = (z, normal = 1) => ({ state: { frame: { origin: [0, 0, z], z: [0, 0, normal] } } });
  assert.equal(partSide(on(4), bounds), -1, "a sketch on the top face: the part is behind it");
  assert.equal(partSide(on(-3), bounds), 1, "a plane under the part: the part is in front");
  assert.equal(partSide(on(2), bounds), 0, "a plane through the part");
  assert.equal(partSide(on(0, -1), bounds), -1, "the bottom face, its normal out of the part");
  assert.equal(partSide({ state: {} }, bounds), 0);
});

test("an extrude's draft and Up To Next, and a hole's counterbore or countersink, go to the command", () => {
  const sketch = { file: "part.py", line: 9, title: "Sketch2" };
  const drafted = commandRequest("extrude", { end: "blind", depth: "5", reverse: false, draft: true, draft_angle: "3", outward: true }, [], null, sketch);
  assert.deepEqual(drafted.inputs, { end: "blind", depth: "5", reverse: false, draft: true, draft_angle: "3", outward: true });
  const next = commandRequest("cut", { end: "next", depth: "5", reverse: true, draft: true, draft_angle: "3" }, [], null, sketch);
  assert.deepEqual(next.inputs, { end: "next" });
  const face = [{ selector: "f6", type: "plane" }];
  const bored = commandRequest("hole", { type: "counterbore", diameter: "3", through: true, cbore_diameter: "6", cbore_depth: "3" }, face);
  assert.deepEqual(bored.inputs, { diameter: "3", depth: "", type: "counterbore", cbore_diameter: "6", cbore_depth: "3" });
  const sunk = commandRequest("hole", { type: "countersink", diameter: "3", through: false, depth: "8", csk_diameter: "6", csk_angle: "90" }, face);
  assert.deepEqual(sunk.inputs, { diameter: "3", depth: "8", type: "countersink", csk_diameter: "6", csk_angle: "90" });
  assert.deepEqual(commandRequest("hole", { type: "simple", diameter: "3", through: true }, face).inputs, { diameter: "3", depth: "" });
});

test("a click on a face puts the hole there: its distance from the face's center, in the part's units", () => {
  const center = [10, 5, 4];
  assert.deepEqual(clickOffsets([22.5, 1.004, 4], center, [0, 0, 1], "mm"), { x: "12.5", y: "-4" });
  assert.deepEqual(clickOffsets([10, 5, 4.0001], center, [0, 0, 1], "mm"), { x: "0", y: "0" });
  assert.deepEqual(clickOffsets([10 + 25.4, 5, 4 - 12.7], center, [0, 1, 0], "in"), { x: "1", z: "-0.5" });
  assert.deepEqual(clickOffsets([14, 5, 1], center, [0.6, 0, 0.8], "mm"), { x: "4", y: "0", z: "-3" }, "a slanted face's, in all three");
  assert.equal(clickOffsets(null, center, [0, 0, 1], "mm"), null);
});

test("a straight edge picked for a pattern gives its direction, X, Y or Z, the last one counting", () => {
  const edge = (min, max, curveType = "line") => ({ selectorType: "edge", pickData: { curveType, bbox: { min, max } } });
  assert.equal(edgeAxis([edge([0, 2, 4], [20, 2, 4])]), "X");
  assert.equal(edgeAxis([edge([0, 2, 4], [20, 2, 4]), edge([5, -3, 0], [5, 7, 0])]), "Y");
  assert.equal(edgeAxis([edge([0, 0, 0], [0, 0, 8])]), "Z");
  assert.equal(edgeAxis([edge([0, 0, 0], [6, 8, 0])]), null, "a slanted edge");
  assert.equal(edgeAxis([edge([0, 0, 0], [6, 6, 0], "circle")]), null, "a curved edge");
  assert.equal(edgeAxis([{ selectorType: "face", pickData: {} }]), null);
});

test("a circular pattern turns about the round face or straight edge picked last, and sends it", () => {
  const round = { selector: "f7", type: "cylinder", center: [5, 5, 4], size: 100.5 };
  const flat = { selector: "f2", type: "plane", center: [0, 0, 2], size: 1600 };
  const straight = { selector: "e3", type: "line", center: [20, 20, 0], size: 4 };
  assert.equal(patternAxis([flat]), null, "a flat face has no axis: Z through the origin");
  assert.equal(patternAxis([round, flat]), round);
  assert.equal(patternAxis([round, straight]), straight);
  const feature = { row: "a.py:4", name: "Hole1" };
  assert.deepEqual(commandRequest("pattern", { type: "circular", count: "6" }, [flat, round], feature),
    { command: "pattern", selection: [round], inputs: { type: "circular", count: "6" }, feature });
  assert.deepEqual(commandRequest("pattern", { type: "circular", count: "6" }, [], feature).selection, []);
  // Edit Feature keeps its axis unless another is picked.
  const editing = { id: "a.py:9", command: "pattern" };
  assert.deepEqual(commandRequest("pattern", { type: "circular", count: "8" }, [], null, null, editing),
    { command: "pattern", selection: [], inputs: { type: "circular", count: "8" }, replace: { row: "a.py:9" } });
});

test("an extrude Up To Surface ends on the flat face picked, Up To Vertex at the clicked edge's end", () => {
  const flat = { selector: "f2", type: "plane", center: [0, 0, -2.5], size: 800 };
  const round = { selector: "f7", type: "cylinder", center: [5, 5, 4], size: 100.5 };
  const edge = { selector: "e3", type: "line", center: [0, -10, -7.5], size: 40 };
  assert.equal(extrudeEnd("surface", [flat, round]), flat, "a round face is not one to end on");
  assert.equal(extrudeEnd("vertex", [flat, edge]), edge);
  assert.equal(extrudeEnd("blind", [flat]), null);
  const sketch = { file: "plate.py", line: 9, title: "Sketch1", constrained: true };
  const values = { ...commandDefaults("extrude", "mm"), end: "surface" };
  assert.deepEqual(commandRequest("extrude", values, [flat], null, sketch),
    { command: "extrude", sketch: { file: "plate.py", line: 9, name: "Sketch1" }, inputs: { end: "surface" }, selection: [flat] });
  assert.equal(commandBlocked("extrude", [], sketch, values), "Select a flat face on the model to end on.");
  const atVertex = { ...values, end: "vertex", vertex_at: [-19, -10, -7.4] };
  assert.deepEqual(commandRequest("extrude", atVertex, [edge], null, sketch).inputs, { end: "vertex", vertex_at: [-19, -10, -7.4] });
  assert.equal(commandBlocked("extrude", [edge], sketch, { ...atVertex, vertex_at: undefined }), "Click near the end of an edge on the model.");
  assert.equal(commandBlocked("extrude", [edge], sketch, atVertex), "");
  // Edit Feature keeps what it ends on, so it waits on no pick.
  assert.equal(commandBlocked("extrude", [], sketch, values, { values: { end: "surface" } }), "");
});
