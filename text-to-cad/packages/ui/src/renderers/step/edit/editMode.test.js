import assert from "node:assert/strict";
import test from "node:test";

import {
  buildingText,
  changeNote,
  defaultRow,
  emptyHistory,
  featureNames,
  formulaWords,
  recordChange,
  redoStep,
  restates,
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
