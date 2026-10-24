import assert from "node:assert/strict";
import test from "node:test";

import { barIndex, featureTree, rolledBack } from "./editMode.js";
import { slotAtX, timelineItems } from "./timeline.js";

const outline = (name, line) => ({ name, plane: "Top", file: "bracket.py", line, status: "Fully defined" });

// A part as the engine reads it: two sketches of their own, each followed by the extrude that
// takes it, then an Edge Blend. The Part Navigator lists them in this order and numbers them
// Sketch (1), Extrude (2), Sketch (3), Extrude (4), Edge Blend (5).
const PART = featureTree({
  features: [
    { key: "s1", kind: "Sketch", file: "bracket.py", line: 5, sketch: outline("Outline", 5) },
    { key: "e1", kind: "Boss-Extrude", name: "plate", file: "bracket.py", line: 8 },
    { key: "s2", kind: "Sketch", file: "bracket.py", line: 10, sketch: outline("Rim", 10) },
    { key: "e2", kind: "Boss-Extrude", name: "plate", file: "bracket.py", line: 13 },
    { key: "b1", kind: "Fillet", name: "plate", file: "bracket.py", line: 15 },
  ],
});
const IDS = ["s1", "e1", "s2", "e2", "b1"];

test("lists items in the Part Navigator's order", () => {
  const { items } = timelineItems(PART, null);
  assert.deepEqual(items.map(item => item.id), IDS);
  // Sketches are items like the rest, each as the Part Navigator titles it (its kind numbered after
  // the datum coordinate system), and each draws the icon of its kind.
  assert.deepEqual(items.map(item => item.title), ['Sketch (1) "Outline"', "Extrude (2)", 'Sketch (3) "Rim"', "Extrude (4)", "Edge Blend (5)"]);
  assert.deepEqual(items.map(item => item.kind), ["Sketch", "Boss-Extrude", "Sketch", "Boss-Extrude", "Fillet"]);
  // Each carries the feature of the tree it stands for, for whoever edits it.
  items.forEach((item, index) => assert.equal(item.feature, PART.features[index]));
});

test("puts the marker after the last active item", () => {
  assert.equal(timelineItems(PART, null).marker, 5);
  const { items, marker } = timelineItems(PART, { item: "e2" });
  assert.equal(marker, 3);
  // What stands past the marker is rolled back: the fourth item and the fifth.
  assert.deepEqual(items.map(item => item.rolledBack), [false, false, false, true, true]);
  assert.deepEqual(timelineItems(PART, null).items.map(item => item.rolledBack), [false, false, false, false, false]);
  // A bar over an item the tree no longer holds leaves the part whole, as the Part Navigator does.
  assert.equal(timelineItems(PART, { item: "gone" }).marker, 5);
});

test("agrees with the Part Navigator's rollback bar wherever it is", () => {
  for (const bar of [null, ...IDS.map(item => ({ item }))]) {
    const { items, marker } = timelineItems(PART, bar);
    assert.equal(marker, barIndex(PART, bar));
    const rolled = rolledBack(PART, bar);
    assert.deepEqual(items.filter(item => item.rolledBack).map(item => item.id), IDS.filter(id => rolled.has(id)));
    // Every item past the marker is rolled back, and none before it.
    assert.deepEqual(items.map((item, index) => item.rolledBack), items.map((item, index) => index >= marker));
  }
});

test("lists no items for an assembly, whose Part Navigator has no rollback bar", () => {
  const assembly = featureTree({ components: [{ file: "tray.py", name: "tray", features: [{ key: "t1", kind: "Boss-Extrude", file: "tray.py", line: 4 }] }] });
  assert.deepEqual(timelineItems(assembly, null), { items: [], marker: 0 });
  assert.deepEqual(timelineItems(null, null), { items: [], marker: 0 });
});

test("places a dragged marker between items", () => {
  // The marker's index is how many item centres the pointer has passed.
  assert.equal(slotAtX(25, [10, 30, 50]), 1);
  assert.equal(slotAtX(60, [10, 30, 50]), 3);
  assert.equal(slotAtX(5, [10, 30, 50]), 0);
  // On a centre it has passed it, as the Part Navigator's bar goes below the row the pointer is past the middle of.
  assert.equal(slotAtX(30, [10, 30, 50]), 2);
  assert.equal(slotAtX(12, []), 0);
});

test("marks who made each item, and nothing unknown", () => {
  const { items } = timelineItems(PART, null, { e2: "agent" });
  assert.deepEqual(items.map(item => item.author), [null, null, null, "agent", null]);
  assert.deepEqual(timelineItems(PART, null, { s1: "you", e1: "agent" }).items.map(item => item.author), ["you", "agent", null, null, null]);
  // No record, a record of someone else, or one that is not a name: nothing is marked.
  assert.ok(timelineItems(PART, null).items.every(item => item.author === null));
  assert.ok(timelineItems(PART, null, { e1: "someone", s1: 1, e2: null, b1: {} }).items.every(item => item.author === null));
  assert.ok(timelineItems(PART, null, undefined).items.every(item => item.author === null));
  assert.ok(timelineItems(PART, null, null).items.every(item => item.author === null));
});
