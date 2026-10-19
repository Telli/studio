import assert from "node:assert/strict";
import test from "node:test";

import { screenTriangles } from "./sketchDrawing.js";

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
