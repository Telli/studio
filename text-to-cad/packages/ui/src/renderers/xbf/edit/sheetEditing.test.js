import assert from "node:assert/strict";
import test from "node:test";

import {
  alignMove, circleEdit, clampMove, deleteEdit, dimensionEdit, dimensionTarget, dimensionText, edgeEnds, moveEdit, movingTogether,
  ownerOf, placeDimension, sheetDimensions, viewAt, viewRef
} from "./sheetEditing.js";

// A sheet as `sheet_payload` sends one: three_views' four views from one call (line 11), and a
// detail placed by hand.
const view = (number, name, at, half, extra = {}) => ({ view: number, name, at, scale: 1,
  box: [at[0] - half[0], at[0] + half[0], at[1] - half[1], at[1] + half[1]], line: 11, end: [11, 62], arranged: true, offset: [0, 0],
  snaps: [], circles: [], ...extra });
const top = view(0, "top", [180, 190], [10, 5], {
  snaps: [{ at: [170, 185], model: [-10, -5, 2], kind: "vertex" }, { at: [190, 185], model: [10, -5, 2], kind: "vertex" },
    { at: [180, 190], model: [0, 0, 2], kind: "centre" }],
  circles: [{ at: [180, 190], radius: 2, model: [0, 0, 2], size: 2, full: true }] });
const front = view(1, "front", [180, 130], [10, 2]);
const right = view(2, "right", [240, 130], [5, 2]);
const iso = view(3, "iso", [390, 190], [12, 9], { offset: [0, 0] });
const detail = view(4, "front", [100, 60], [8, 8], { line: 14, end: [14, 40], arranged: false, offset: null });
const sheet = { frame: [10, 410, 10, 287], views: [top, front, right, iso, detail],
  sources: { A1: { kind: "view", view: 0 }, B2: { kind: "overall", view: 0, line: 12, end: [12, 17] }, B3: { kind: "overall", view: 0, line: 12, end: [12, 17] },
    C4: { kind: "dim", view: 1, dim: 0, type: "linear", line: 13, end: [13, 41] }, C5: { kind: "dim", view: 1, dim: 1, type: "linear", line: 13, end: [13, 74] } } };

test("three_views' top, front and right move together; its isometric and a view placed by hand move alone", () => {
  assert.deepEqual(movingTogether(sheet, front).map(each => each.name), ["top", "front", "right"]);
  assert.deepEqual(movingTogether(sheet, iso), [iso]);
  assert.deepEqual(movingTogether(sheet, detail), [detail]);
  // A change names a view by its call and which of the call's views it is.
  assert.deepEqual(viewRef(sheet, right), { end: [11, 62], arranged: true, offset: [0, 0], at: [240, 130], name: "right", nth: 2 });
  assert.deepEqual(viewRef(sheet, detail).nth, 0);
  assert.deepEqual(moveEdit(sheet, right, [10.04, -3.96]).by, [10, -4]);
});

test("a press picks the smallest view it is in, and a drag stops at the sheet's frame", () => {
  assert.equal(viewAt(sheet, [181, 189]), top);
  assert.equal(viewAt(sheet, [300, 30]), null);
  assert.equal(viewAt(sheet, [171, 133], 2), front);
  // The three views together stop where the right one meets the frame's right edge.
  assert.deepEqual(clampMove(sheet, movingTogether(sheet, front), [500, 0]), [410 - 245, 0]);
  assert.deepEqual(clampMove(sheet, [iso], [0, 200]), [0, 287 - 199]);
  assert.deepEqual(clampMove(sheet, [detail], [-5, 3]), [-5, 3]);
});

test("a view placed by hand lines up with another's centre within the tolerance, with a guide to it", () => {
  const { by, guides } = alignMove(sheet, [detail], [78.5, 3], 2);
  assert.deepEqual(by, [80, 3]);
  assert.deepEqual(guides, [[[180, 63], [180, 190]]]);
  assert.deepEqual(alignMove(sheet, movingTogether(sheet, front), [5, 5], 2), { by: [5, 5], guides: [] });
});

test("the sheet's dimensions are its calls: overall's two are one, a chain's two are two", () => {
  const dimensions = sheetDimensions(sheet);
  assert.deepEqual([...dimensions.values()].map(each => [each.kind, each.handles]), [["overall", ["B2", "B3"]], ["dim", ["C4"]], ["dim", ["C5"]]]);
  assert.equal(ownerOf(sheet, dimensions, "B3").dimension.key, "overall@12:17");
  assert.equal(ownerOf(sheet, dimensions, "A1").view, top);
  assert.equal(ownerOf(sheet, dimensions, "ZZ"), null);
  assert.deepEqual(deleteEdit(sheet, dimensions.get("dim@13:74")), { kind: "delete", end: [13, 74], name: "front" });
});

test("Smart Dimension takes a corner or a centre first, then a circle's rim, and a straight edge by its two ends", () => {
  assert.equal(dimensionTarget(top, [170.4, 185.2], 1).snap.model[0], -10);
  assert.equal(dimensionTarget(top, [180.2, 190.1], 1).snap.kind, "centre");
  const rim = dimensionTarget(top, [182.1, 190], 0.5);
  assert.equal(rim.kind, "circle");
  assert.deepEqual(circleEdit(sheet, top, rim.circle), { kind: "diameter", view: viewRef(sheet, top), center: [0, 0, 2], radius: 2 });
  assert.equal(circleEdit(sheet, top, { ...rim.circle, full: false }).kind, "radius");
  assert.equal(dimensionTarget(top, [175, 170], 1), null);
  assert.deepEqual(edgeEnds(top, [170, 185, 190, 185]).map(snap => snap.model), [[-10, -5, 2], [10, -5, 2]]);
  assert.equal(edgeEnds(top, [170, 185, 170, 195]), null);
});

test("a dimension is placed where the pointer takes it: across from above or below, up from beside", () => {
  const a = [170, 185], b = [190, 195];
  const above = placeDimension(a, b, [180, 205]);
  assert.deepEqual([above.orientation, above.offset, above.line, above.value], ["h", 10, [[170, 205], [190, 205]], 20]);
  const below = placeDimension(a, b, [180, 184]);
  assert.deepEqual([below.orientation, below.offset], ["h", -4]);
  const beside = placeDimension(a, b, [160, 190]);
  assert.deepEqual([beside.orientation, beside.offset, beside.line, beside.value], ["v", -10, [[160, 185], [160, 195]], 10]);
  // A pair one above the other is measured up, wherever the pointer is.
  assert.equal(placeDimension([170, 185], [170, 195], [170, 230]).orientation, "v");
  // The direction is written only where the drawing would not take it on its own.
  const first = { at: a, model: [0, 0, 0] }, second = { at: b, model: [20, 10, 0] };
  assert.deepEqual(dimensionEdit(sheet, top, first, second, above), { kind: "dim", view: viewRef(sheet, top), from: [0, 0, 0], to: [20, 10, 0], offset: 10 });
  assert.equal(dimensionEdit(sheet, top, first, second, beside).orientation, "v");
  assert.equal(dimensionText(20, 0.5, "mm"), "40");
  assert.equal(dimensionText(25.4 * 0.3125, 1, "in"), ".313");
});
