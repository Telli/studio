import assert from "node:assert/strict";
import test from "node:test";

import { fillShapes, lineNearestRay, loopsCentroid, screenDirection, screenTriangles } from "./sketchDrawing.js";

// A view that looks down Z: a place's x and y are its pixels, and a place above the camera is behind it.
const looking = (x, y, z) => (z > 10 ? null : [x, y]);
const turn = ([ax, ay, bx, by, cx, cy]) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

test("a solid's near and far sides turn the same way on the screen, so a fill shades what they cover once", () => {
  // One square seen from above and below: its far side is wound the other way, as a closed solid's is.
  const positions = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 20];
  const near = [0, 1, 2];
  const far = [0, 2, 1];
  const shaded = screenTriangles(positions, [...near, ...far], looking);
  assert.equal(shaded.length, 12);
  assert.deepEqual([turn(shaded.slice(0, 6)), turn(shaded.slice(6, 12))], [1, 1]);
  // A triangle with a corner behind the camera is left out.
  assert.deepEqual(screenTriangles(positions, [0, 1, 4], looking), []);
});

test("an arrow starts from the middle of the material an outline bounds, a hole taken away", () => {
  const square = (x, y, size) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
  assert.deepEqual(loopsCentroid([square(0, 0, 10)]), [5, 5]);
  // A hole in the right half moves the middle left: 100 of area at 5, less 25 at 7.5.
  const [x, y] = loopsCentroid([square(0, 0, 10), square(5, 2.5, 5)], [false, true]);
  assert.ok(Math.abs(x - (100 * 5 - 25 * 7.5) / 75) < 1e-9 && Math.abs(y - 5) < 1e-9);
  assert.equal(loopsCentroid([]), null);
});

test("a direction across the view is drawn its way on the screen, one along the line of sight end on", () => {
  // A camera looking down -z at the part, one pixel a millimetre: x right, y up.
  const mapping = { toScreen: (x, y, z) => (z > 100 ? null : [x, -y]), toView: (x, y, z) => [x, y, z - 100] };
  assert.deepEqual(screenDirection(mapping, [0, 0, 0], [1, 0, 0], 10), { from: [0, -0], toward: [10, 0], facing: 0 });
  assert.equal(screenDirection(mapping, [0, 0, 0], [0, 0, 1], 10).facing, 1);
  assert.equal(screenDirection(mapping, [0, 0, 0], [0, 0, -1], 10).facing, -1);
  assert.equal(screenDirection(mapping, [0, 0, 200], [1, 0, 0], 10), null);
});

test("a swept solid's faces are filled as one, turned one way round, a hole the other", () => {
  const turns = [];
  let points = [];
  const context = {
    save() {}, restore() {}, beginPath() {}, fill() {},
    moveTo(x, y) { points = [[x, y]]; }, lineTo(x, y) { points.push([x, y]); },
    closePath() { turns.push(Math.sign(points.reduce((sum, [x0, y0], at) => { const [x1, y1] = points[(at + 1) % points.length]; return sum + x0 * y1 - x1 * y0; }, 0))); },
  };
  const outline = [[0, 0], [10, 0], [10, 10], [0, 10]];
  fillShapes(context, [{ points: outline }, { points: [...outline].reverse() }, { points: outline, hole: true }], "#000", 0.3);
  assert.deepEqual(turns, [1, 1, -1]);
});

test("a drag along a handle's line reads the place on it nearest the pointer's ray", () => {
  // The line up Z through the origin; a ray across it, 5 up.
  assert.equal(lineNearestRay([0, 0, 0], [0, 0, 1], [10, 3, 5], [-1, 0, 0]), 5);
  // A ray down the line itself has no one nearest place.
  assert.equal(lineNearestRay([0, 0, 0], [0, 0, 1], [0, 0, 50], [0, 0, -1]), null);
});
