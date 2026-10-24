import assert from "node:assert/strict";
import test from "node:test";

import { editLayoutState } from "./editLayout.js";

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
