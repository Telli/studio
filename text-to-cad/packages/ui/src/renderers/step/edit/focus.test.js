import assert from "node:assert/strict";
import test from "node:test";

import { featureTree, treeFeatures } from "./editMode.js";
import { featureAtLine, focusAnswer } from "./focus.js";

// A bracket as the engine reads its script (`featureTree`), each feature by the first lines of the statements it stands for:
//    9  @step
//   10  def bracket():
//   11      base = Box(40, 20, 5)
//   12      base = fillet(base.edges().filter_by(Axis.Z), radius=2)
//   13
//   14      pin = Pos(10, 0) * Cylinder(1.6, 5)
//   15      base -= pin
//   16
//   17      # The cable's slot
//   18      slot = SlotOverall(12, 3)
//   19      base -= extrude(slot, amount=5)
//   20      return base
// The hole is the pin cut from the base, one Cut-Extrude as a CAD tree shows it: the cut's line is folded into the pin's
// feature. The slot's profile is its Cut-Extrude's sketch, its line folded in too.
const row = (line, code) => ({ key: `parts/bracket.py:${line}`, file: "parts/bracket.py", line, code });
const ROWS = [
  row(11, "base = Box(40, 20, 5)"),
  row(12, "base = fillet(base.edges().filter_by(Axis.Z), radius=2)"),
  row(14, "pin = Pos(10, 0) * Cylinder(1.6, 5)"),
  row(15, "base -= pin"),
  row(18, "slot = SlotOverall(12, 3)"),
  row(19, "base -= extrude(slot, amount=5)"),
];
const feature = (line, kind, rows = [line]) => ({ key: `parts/bracket.py:${line}`, kind, name: "base", file: "parts/bracket.py", line,
  text: ROWS.find(each => each.line === line).code, rows: rows.map(each => `parts/bracket.py:${each}`) });
const BRACKET = treeFeatures(featureTree({
  rows: ROWS,
  features: [feature(11, "Boss-Extrude"), feature(12, "Fillet"), feature(14, "Cut-Extrude", [14, 15]),
    feature(19, "Cut-Extrude", [18, 19])],
}));
const HOLE = "parts/bracket.py:14";
const SLOT = "parts/bracket.py:19";

test("featureAtLine finds the hole feature for a line inside its statement, and null for a blank line", () => {
  // The line that cuts the pin from the base is the hole's, as much as the pin's own line is.
  assert.equal(featureAtLine(BRACKET, "parts/bracket.py", 15)?.id, HOLE);
  assert.equal(featureAtLine(BRACKET, "parts/bracket.py", 14)?.id, HOLE);
  assert.equal(featureAtLine(BRACKET, "parts/bracket.py", 13), null);
  // A profile's line is the feature it is the sketch of.
  assert.equal(featureAtLine(BRACKET, "parts/bracket.py", 18)?.id, SLOT);
  // Lines outside every statement a feature stands for: a comment, the part's function, its return, past the end.
  for (const line of [17, 9, 10, 20, 400]) assert.equal(featureAtLine(BRACKET, "parts/bracket.py", line), null, `line ${line}`);
});

test("the script is told by its path at a folder's edge, however the host names it", () => {
  // In full, from a folder above the project's, or less of it; Windows' separators too.
  for (const file of ["/work/rover/parts/bracket.py", "rover/parts/bracket.py", "bracket.py", "./parts/bracket.py", "parts\\bracket.py"]) {
    assert.equal(featureAtLine(BRACKET, file, 15)?.id, HOLE, file);
  }
  // Another script's line 15 is none of this part's, nor is a name that only ends the same.
  for (const file of ["parts/clip.py", "racket.py", "parts/bracket.pyc", ""]) assert.equal(featureAtLine(BRACKET, file, 15), null, file);
});

test("featureAtLine takes the innermost feature where two stand for one statement", () => {
  // A join whose tools are both made above it is folded into each: its line is the post's and the rib's.
  const joined = treeFeatures(featureTree({ features: [
    { key: "a.py:21", kind: "Boss-Extrude", file: "a.py", line: 21, rows: ["a.py:21", "a.py:24"] },
    { key: "a.py:23", kind: "Boss-Extrude", file: "a.py", line: 23, rows: ["a.py:23", "a.py:24"] },
  ] }));
  assert.equal(featureAtLine(joined, "a.py", 24)?.id, "a.py:23");
  assert.equal(featureAtLine([...joined].reverse(), "a.py", 24)?.id, "a.py:23");
  assert.equal(featureAtLine(joined, "a.py", 21)?.id, "a.py:21");
  // Nothing to find in no features, or at no line.
  assert.equal(featureAtLine([], "a.py", 24), null);
  assert.equal(featureAtLine(joined, "a.py", 0), null);
});

test("the part on screen answers its host's ask once the part is read, however it went", () => {
  const ask = { path: "parts/bracket.py", line: 15, nonce: 7 };
  const reading = { layout: "manual", features: [] };
  // While the server says whether there is a script, and while the part is read: no answer yet.
  assert.equal(focusAnswer(ask, { ...reading, status: "probing" }), null);
  assert.equal(focusAnswer(ask, { ...reading, status: "reading" }), null);
  // Read: the feature there selected; at a blank line nothing, answered all the same.
  assert.deepEqual(focusAnswer(ask, { layout: "manual", status: "ready", features: BRACKET }), { select: HOLE });
  assert.deepEqual(focusAnswer({ ...ask, line: 13 }, { layout: "manual", status: "ready", features: BRACKET }), { select: null });
  // A file with no part script, and a part whose build failed, have no features read: answered, nothing selected.
  assert.deepEqual(focusAnswer(ask, { ...reading, status: "none" }), { select: null });
  assert.deepEqual(focusAnswer(ask, { ...reading, status: "error" }), { select: null });
  // Laid out for the AI, the view shows no features to select: answered at once, the part read or not.
  assert.deepEqual(focusAnswer(ask, { layout: "ai", status: "idle", features: [] }), { select: null });
  assert.deepEqual(focusAnswer(ask, { layout: "ai", status: "ready", features: BRACKET }), { select: null });
});
