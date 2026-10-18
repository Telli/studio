import { curvePoints } from "./sketchDrawing.js";
import { sketchGeometry } from "./sketchMode.js";

/**
 * Picking a sketch on the model, as a CAD tool picks one for a feature: each sketch's lines and
 * closed outlines in the view's pixels, the sketch under the pointer, and where an extrude's
 * preview draws the outline again.
 */

/** Pixels from a sketch's line that still pick it. */
export const PICK_PX = 6;
/** How far a press may move and still be a click, as the viewer's own picking allows. */
export const CLICK_SLOP_PX = 4;

const segmentDistance = ([x, y], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
};

const polygonArea = points => Math.abs(points.reduce((sum, [x0, y0], index) => {
  const [x1, y1] = points[(index + 1) % points.length];
  return sum + x0 * y1 - x1 * y0;
}, 0)) / 2;

const inside = ([x, y], points) => {
  let crossed = false;
  for (let index = 0, last = points.length - 1; index < points.length; last = index++) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[last];
    if ((y0 > y) !== (y1 > y) && x < x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)) crossed = !crossed;
  }
  return crossed;
};

/**
 * A sketch as the view shows it: its lines and its closed outlines (`state.loops`) as screen
 * polylines through `toScreen` (a place on the sketch to the view's pixels, or null behind the
 * camera). A polyline with a point behind the camera is left out: it is not there to be picked.
 */
export function screenSketch(state, toScreen) {
  const line = points => {
    const out = points.map(toScreen);
    return out.length > 1 && out.every(Boolean) ? out : null;
  };
  return {
    curves: sketchGeometry(state).curves.map(curve => line(curvePoints(curve))).filter(Boolean),
    loops: (state?.loops || []).map(line).filter(Boolean),
  };
}

/** The pixels from `point` to the nearest line of a drawn sketch; Infinity with none on screen. */
export function lineDistance(drawn, point) {
  let nearest = Infinity;
  for (const curve of drawn.curves) {
    for (let index = 1; index < curve.length; index += 1) nearest = Math.min(nearest, segmentDistance(point, curve[index - 1], curve[index]));
  }
  return nearest;
}

/**
 * The area of the profile `point` is in, inside an odd number of the sketch's outlines (a hole
 * is not the profile): the smallest outline around it, or null outside.
 */
export function profileArea(drawn, point) {
  const around = drawn.loops.filter(loop => inside(point, loop));
  if (around.length % 2 === 0) return null;
  return Math.min(...around.map(polygonArea));
}

/**
 * The sketch under the pointer, by its index: one with a line within PICK_PX (the nearest), else,
 * with `profiles`, the one whose shaded profile the pointer is in (the smallest, so a sketch
 * drawn inside another's outline can still be picked). -1 for none.
 */
export function sketchAt(drawn, point, { profiles = false } = {}) {
  let best = -1;
  let bestDistance = PICK_PX;
  drawn.forEach((sketch, index) => {
    const distance = sketch ? lineDistance(sketch, point) : Infinity;
    if (distance <= bestDistance) { best = index; bestDistance = distance; }
  });
  if (best >= 0 || !profiles) return best;
  let smallest = Infinity;
  drawn.forEach((sketch, index) => {
    const area = sketch ? profileArea(sketch, point) : null;
    if (area !== null && area < smallest) { best = index; smallest = area; }
  });
  return best;
}

/**
 * Where a sketch's name tag goes, `width` pixels wide: left of what is drawn of it, at its middle,
 * clear of an extrude's preview rising off it; above its top-left when the view's edge is too
 * close. Its top-left corner, or null when nothing of the sketch is drawn.
 */
export function tagPlace(drawn, width, height) {
  const points = [...drawn.curves, ...drawn.loops].flat();
  if (!points.length) return null;
  const left = Math.min(...points.map(([x]) => x));
  const top = Math.min(...points.map(([, y]) => y));
  const bottom = Math.max(...points.map(([, y]) => y));
  if (left - width - 8 >= 2) return [left - width - 8, (top + bottom) / 2 - height / 2];
  return [Math.max(2, left), Math.max(2, top - height - 6)];
}

/**
 * The span an extrude takes along its sketch's normal, in the part's millimetres, as a CAD tool
 * previews Direction 1: from the plane by the depth, the other way when reversed, half each way
 * at Mid Plane, and `through` (the part's extent) at Through All. Null without a depth to show.
 */
export function extrudeSpan({ end, depth, reverse }, through = 0) {
  const length = end === "through" ? through : depth;
  if (!(length > 0)) return null;
  if (end === "mid") return [-length / 2, length / 2];
  return reverse ? [-length, 0] : [0, length];
}

/**
 * The points of an outline the preview joins to its copy, as a CAD tool draws a solid's side
 * edges: its corners, or four around one that turns smoothly all the way (a circle, a slot).
 */
export function sideIndexes(loop) {
  const count = loop.length;
  const corners = [];
  for (let index = 0; index < count; index += 1) {
    const [ax, ay] = loop[(index - 1 + count) % count];
    const [bx, by] = loop[index];
    const [cx, cy] = loop[(index + 1) % count];
    const turn = Math.abs(Math.atan2((bx - ax) * (cy - by) - (by - ay) * (cx - bx), (bx - ax) * (cx - bx) + (by - ay) * (cy - by)));
    if (turn > Math.PI / 6) corners.push(index);
  }
  if (corners.length || count < 4) return corners;
  return [0, 1, 2, 3].map(quarter => Math.floor((quarter * count) / 4));
}

/**
 * A sketch's frame turned about one of its lines (from `a` to `b`, in the sketch's units) by
 * `degrees`, as a revolve turns its profile: the frame of the profile there, in the part's
 * millimetres, to draw it with `planeMapping`. Null for a line of no length.
 */
export function revolvedFrame(frame, unit, a, b, degrees) {
  const at = ([u, v]) => [0, 1, 2].map(axis => frame.origin[axis] + (u * frame.x[axis] + v * frame.y[axis]) * unit);
  const start = at(a);
  const end = at(b);
  const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  if (!(length > 0)) return null;
  const d = [0, 1, 2].map(axis => (end[axis] - start[axis]) / length);
  const turn = degrees * Math.PI / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  // Rodrigues' rotation about the line's direction.
  const turned = v => {
    const along = d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
    const cross = [d[1] * v[2] - d[2] * v[1], d[2] * v[0] - d[0] * v[2], d[0] * v[1] - d[1] * v[0]];
    return [0, 1, 2].map(axis => v[axis] * cos + cross[axis] * sin + d[axis] * along * (1 - cos));
  };
  const origin = turned([0, 1, 2].map(axis => frame.origin[axis] - start[axis])).map((value, axis) => value + start[axis]);
  return { origin, x: turned(frame.x), y: turned(frame.y), z: turned(frame.z) };
}
