import assert from "node:assert/strict";
import test from "node:test";

import { doubleClickLayout, editLayoutState } from "./editLayout.js";

test("a file has the two layouts once the server says it has a part script, one whose build failed too", () => {
  for (const status of ["probing", "none"]) assert.equal(editLayoutState({ status }).editable, false, status);
  for (const status of ["reading", "idle", "ready", "error"]) assert.equal(editLayoutState({ status }).editable, true, status);
});

test("a command, a sketch, a pick or a change being saved holds the layout until it is finished or cancelled", () => {
  const ready = { status: "ready", command: null, sketch: null, picking: false, saving: false };
  assert.deepEqual(editLayoutState(ready), { editable: true, busy: false });
  for (const open of [{ command: "extrude" }, { sketch: { name: "Sketch (1)" } }, { picking: true }, { saving: true }]) {
    assert.equal(editLayoutState({ ...ready, ...open }).busy, true, JSON.stringify(open));
  }
});

test("in Studio, a double-click on a face of a part laid out for the AI steps into CAD on it; a plain STEP or an assembly keeps Normal To", () => {
  const part = { layout: "ai", hosted: true, editable: true, assembly: false, target: "face", open: false };
  assert.equal(doubleClickLayout(part), "manual");
  // A STEP with no part script has no CAD mode: Normal To as today, no switch.
  assert.equal(doubleClickLayout({ ...part, editable: false }), null);
  // Jake's own viewer, which no host lays out, keeps its layout and Normal To.
  assert.equal(doubleClickLayout({ ...part, hosted: false }), null);
  // An assembly's faces are its parts': Normal To.
  assert.equal(doubleClickLayout({ ...part, assembly: true }), null);
  // Empty space laid out for the AI does what it always has.
  assert.equal(doubleClickLayout({ ...part, target: "empty" }), null);
});

test("in Studio's CAD workspace, a double-click on empty space with nothing open goes back to the AI; on a face it selects as ever", () => {
  const empty = { layout: "manual", hosted: true, editable: true, assembly: false, target: "empty", open: false };
  assert.equal(doubleClickLayout(empty), "ai");
  assert.equal(doubleClickLayout({ ...empty, assembly: true }), "ai");
  // A command, sketch, pick or sheet open: it stays.
  assert.equal(doubleClickLayout({ ...empty, open: true }), null);
  // A face is the workspace's own double-click: its feature selected.
  assert.equal(doubleClickLayout({ ...empty, target: "face" }), null);
  assert.equal(doubleClickLayout({ ...empty, hosted: false }), null);
  assert.equal(doubleClickLayout({ ...empty, editable: false }), null);
});
