import assert from "node:assert/strict";
import test from "node:test";

import {
  buildingText,
  changeNote,
  commandBlocked,
  commandDefaults,
  commandNote,
  commandRequest,
  commandUndoNote,
  defaultRow,
  emptyHistory,
  faceOffsetAxes,
  featureNames,
  formulaWords,
  recordChange,
  redoStep,
  restates,
  selectionItems,
  selectionLabel,
  sizeName,
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
