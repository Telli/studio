import assert from "node:assert/strict";
import test from "node:test";

import { PICK_PX, extrudeSpan, screenSketch, sideIndexes, sketchAt, tagPlace } from "./sketchPicking.js";

const square = (x, y, size) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
// A sketch as the view draws it: its lines and its outlines, in pixels.
const drawn = (loops, curves = loops.map(loop => [...loop, loop[0]])) => ({ curves, loops });

test("a click near a sketch's line picks that sketch, the nearest of two", () => {
  const left = drawn([square(0, 0, 100)]);
  const right = drawn([square(103, 0, 100)]);
  assert.equal(sketchAt([left, right], [102, 50]), 1);
  assert.equal(sketchAt([left, right], [101, 50]), 0);
  assert.equal(sketchAt([left, right], [50, 100 + PICK_PX + 1]), -1);
});

test("inside an outline picks only while a feature waits for a sketch, never in its hole", () => {
  const plate = drawn([square(0, 0, 100), square(40, 40, 20)]);
  assert.equal(sketchAt([plate], [20, 20]), -1);
  assert.equal(sketchAt([plate], [20, 20], { profiles: true }), 0);
  assert.equal(sketchAt([plate], [50, 50], { profiles: true }), -1);
});

test("of two sketches one inside the other, the smaller is picked inside it", () => {
  const big = drawn([square(0, 0, 200)]);
  const small = drawn([square(50, 50, 40)]);
  assert.equal(sketchAt([big, small], [70, 70], { profiles: true }), 1);
  assert.equal(sketchAt([big, small], [20, 20], { profiles: true }), 0);
});

test("a sketch partly behind the camera is not there to be picked", () => {
  const state = { points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }], curves: [{ id: "Line1", kind: "line", start: "a", end: "b" }],
    loops: [[[0, 0], [10, 0], [10, 10]]] };
  const shown = screenSketch(state, ([x, y]) => (x > 5 ? null : [x, y]));
  assert.deepEqual(shown, { curves: [], loops: [] });
  assert.equal(screenSketch(state, ([x, y]) => [x * 2, y * 2]).curves.length, 1);
});

test("an extrude's preview spans its depth along the normal, the other way reversed", () => {
  assert.deepEqual(extrudeSpan({ end: "blind", depth: 10, reverse: false }), [0, 10]);
  assert.deepEqual(extrudeSpan({ end: "blind", depth: 10, reverse: true }), [-10, 0]);
  assert.deepEqual(extrudeSpan({ end: "mid", depth: 10, reverse: false }), [-5, 5]);
  assert.deepEqual(extrudeSpan({ end: "through", depth: 0, reverse: true }, 80), [-80, 0]);
  assert.equal(extrudeSpan({ end: "blind", depth: Number.NaN, reverse: false }), null);
});

test("the preview joins an outline to its copy at its corners, or four times around a round one", () => {
  assert.deepEqual(sideIndexes(square(0, 0, 10)), [0, 1, 2, 3]);
  const circle = Array.from({ length: 64 }, (_, index) => [Math.cos((index / 64) * 2 * Math.PI), Math.sin((index / 64) * 2 * Math.PI)]);
  assert.deepEqual(sideIndexes(circle), [0, 16, 32, 48]);
});

test("the sketch's name is tagged at its left, clear of a preview rising off it, or above it at the view's edge", () => {
  assert.deepEqual(tagPlace(drawn([square(100, 40, 20)]), 50, 18), [42, 41]);
  assert.deepEqual(tagPlace(drawn([square(30, 40, 20)]), 50, 18), [30, 16]);
  assert.equal(tagPlace({ curves: [], loops: [] }, 50, 18), null);
});
