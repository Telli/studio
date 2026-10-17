import assert from "node:assert/strict";
import test from "node:test";

import {
  buildingText,
  changeNote,
  changesSince,
  commandBlocked,
  commandDefaults,
  commandNote,
  commandRequest,
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
  // What the feature acts on stays as it is: no selection is sent, and none is waited for.
  const items = selectionItems([EDGE]);
  assert.deepEqual(commandRequest("fillet", { radius: ".06" }, items, null, null, editing),
    { command: "fillet", selection: [], inputs: { radius: ".06" }, replace: { row: "a.py:9" } });
  assert.equal(commandBlocked("fillet", [], null, {}, editing), "");
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

test("a hole moves along the two axes that lie in its face", () => {
  assert.deepEqual(faceOffsetAxes([0, 0, 1]), ["x", "y"]);
  assert.deepEqual(faceOffsetAxes([-1, 0, 0]), ["y", "z"]);
  assert.deepEqual(faceOffsetAxes([0, -1, 0]), ["x", "z"]);
  assert.deepEqual(faceOffsetAxes([0.6, 0.8, 0]), []);
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
