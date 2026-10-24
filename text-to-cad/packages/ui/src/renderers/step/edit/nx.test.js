import assert from "node:assert/strict";
import test from "node:test";

import { EDIT_COMMANDS } from "./editMode.js";
import { SOLID_GROUPS, booleanOf, workspaceTabs } from "./nx.js";

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
