// Marks on a face, as shapes in that face's own coordinates: what a prompt carries of the annotation beside its picture and
// what each mark touches (`annotation3d.js`), so the agent gets geometry, not a paragraph ("Cut a window here for the servo's
// cable, about this size"). A mark counts when its first touch is a face, it touches no other face, and every point, where
// it falls on the model (`under`), lies within 0.05 of the part's units of its level's plane; every other mark stays with
// the picture and its touches, and no face is guessed for it. Which touches are faces the renderer says, naming them
// (`labelOf`): the kit reads no reference's grammar. Each face has one frame: its origin the level's point of the
// first mark on it, `u` the model's +X laid on the face (+Y where +X is within 10° of the face's normal), `v` the normal
// across `u`. Lengths are in the part's units to a tenth, directions to a thousandth, angles in degrees to a tenth. Pure.

/** How near its level's plane each point of a mark on a face lies, in the part's units. */
const ON_FACE = 0.05;
// The part's units in the model's millimetres; units the model is not converted from are its own.
const MILLIMETRES = Object.freeze({ mm: 1, in: 25.4 });
// +X within this of a face's normal (the cosine of 10°) lies too steeply across the face to measure along it: +Y does.
const STEEP = Math.cos(10 * Math.PI / 180);
// Two marks on one face share its frame where their levels are one plane: normals this near (the cosine of half a degree).
const SAME_NORMAL = Math.cos(0.5 * Math.PI / 180);

/**
 * @typedef {{ origin: number[], u: number[], v: number[], normal: number[] }} FaceFrame
 * @typedef {{ kind: "polygon" | "polyline", points: number[][] }
 *   | { kind: "rectangle", center: number[], size: number[], angle: number }
 *   | { kind: "ellipse", center: number[], radii: number[], angle: number }
 *   | { kind: "arrow" | "line", from: number[], to: number[] }
 *   | { kind: "text", at: number[], text: string }} FaceShape
 *   Points are `[u, v]` in the face's frame. A rectangle's `size` and an ellipse's `radii` are along and across its `angle`
 *   from `u`, turned no more than 45° either way.
 * @typedef {{ face: string, label: string, frame: FaceFrame, shapes: FaceShape[] }} FaceShapes
 */

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const length = Math.hypot(...a) || 1; return a.map(value => value / length); };
// A length to a tenth and a direction to a thousandth, never -0.
const tenth = value => Math.round(value * 10) / 10 || 0;
const thousandth = value => Math.round(value * 1000) / 1000 || 0;
const tenths = values => values.map(tenth);

// A face's name by its reference, as the renderer gives it; null for a reference that names no face, or none.
const faceName = (ref, labelOf) => (ref && labelOf ? labelOf(ref) ?? null : null);
// The face a mark is on, with its name: its first touch, a face, and no other face among its touches; null for any other mark.
function faceOf(touches = [], labelOf) {
  const face = touches[0]?.ref, label = faceName(face, labelOf);
  if (label === null || !touches.every(touch => touch.ref === face || faceName(touch.ref, labelOf) === null)) return null;
  return { face, label: label || face };
}

// A mark's level as a frame (`FaceFrame`, unrounded, in the model's millimetres).
function frameOf(level) {
  const normal = unit(level.normal);
  const along = Math.abs(normal[0]) > STEEP ? [0, 1, 0] : [1, 0, 0];
  const u = unit(minus(along, normal.map(value => value * dot(along, normal))));
  return { origin: [...level.point], u, v: cross(normal, u), normal };
}
const pointsOf = values => Array.from({ length: values.length / 3 }, (_, index) => [values[index * 3], values[index * 3 + 1], values[index * 3 + 2]]);
const liesOn = (points, level, tolerance) => {
  const normal = unit(level.normal);
  return points.every(point => Math.abs(dot(minus(point, level.point), normal)) <= tolerance);
};
const samePlane = (frame, level, tolerance) => dot(frame.normal, unit(level.normal)) >= SAME_NORMAL
  && Math.abs(dot(minus(level.point, frame.origin), frame.normal)) <= tolerance;

// How far `point` is from the segment `a`–`b`, in the face's plane.
function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// The fewest of a line's points that keep within `tolerance` of it (Douglas and Peucker's), its ends kept.
function simplified(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = points.map((_, index) => index === 0 || index === points.length - 1);
  const spans = [[0, points.length - 1]];
  while (spans.length) {
    const [from, to] = spans.pop();
    let farthest = -1, distance = tolerance;
    for (let index = from + 1; index < to; index += 1) {
      const away = segmentDistance(points[index], points[from], points[to]);
      if (away > distance) { distance = away; farthest = index; }
    }
    if (farthest < 0) continue;
    keep[farthest] = true;
    spans.push([from, farthest], [farthest, to]);
  }
  return points.filter((_, index) => keep[index]);
}
// A closed line's points without the one it closes on.
const ring = points => (points.length > 1 && Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 1e-9 ? points.slice(0, -1) : points);
// Rounded to a tenth, a point that rounds onto the one before it dropped (and, closed, onto the first).
function roundedPoints(points, closed) {
  const out = [];
  for (const point of points.map(tenths)) if (!out.length || out.at(-1).some((value, axis) => value !== point[axis])) out.push(point);
  if (closed && out.length > 1 && out[0].every((value, axis) => value === out.at(-1)[axis])) out.pop();
  return out;
}
function polylineOf(points, tolerance) {
  return { kind: "polyline", points: roundedPoints(simplified(points, tolerance), false) };
}
function polygonOf(points, tolerance) {
  const loop = ring(points);
  let kept = simplified([...loop, loop[0]], tolerance).slice(0, -1);
  // Where it started on a side, its start is no corner.
  if (kept.length > 3 && segmentDistance(kept[0], kept.at(-1), kept[1]) <= tolerance) kept = kept.slice(1);
  const corners = roundedPoints(kept, true);
  return corners.length >= 3 ? { kind: "polygon", points: corners } : { kind: "polyline", points: corners };
}

// The convex hull of points in the plane, anticlockwise (Andrew's monotone chain).
function hullOf(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => list.reduce((chain, point) => {
    while (chain.length >= 2 && turn(chain.at(-2), chain.at(-1), point) <= 0) chain.pop();
    chain.push(point);
    return chain;
  }, []);
  if (sorted.length < 3) return sorted;
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
}
// A rectangle's or an ellipse's angle turned to within 45° of `u` either way, its two lengths (`key`) swapped as it turns.
function squared(shape, key) {
  let angle = ((shape.angle % 180) + 180) % 180;
  let [along, across] = shape[key];
  if (angle > 135) angle -= 180;
  else if (angle > 45) { angle -= 90; [along, across] = [across, along]; }
  return { ...shape, center: tenths(shape.center), [key]: tenths([along, across]), angle: tenth(angle) };
}
// The rectangle a Shapes rectangle lies in on the face: the least that holds every point, one side along a side of their hull.
function rectangleOf(points) {
  const hull = hullOf(points);
  let best = null;
  hull.forEach(([ax, ay], index) => {
    const [bx, by] = hull[(index + 1) % hull.length];
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 1e-9) return;
    const ux = (bx - ax) / length, uy = (by - ay) / length;
    const along = hull.map(([x, y]) => x * ux + y * uy), across = hull.map(([x, y]) => y * ux - x * uy);
    const box = { ux, uy, a: [Math.min(...along), Math.max(...along)], b: [Math.min(...across), Math.max(...across)] };
    box.area = (box.a[1] - box.a[0]) * (box.b[1] - box.b[0]);
    if (!best || box.area < best.area - 1e-9 * Math.max(1, best.area)) best = box;
  });
  if (!best) return null;
  const { ux, uy, a, b } = best;
  const middle = [(a[0] + a[1]) / 2, (b[0] + b[1]) / 2];
  return squared({ kind: "rectangle", center: [middle[0] * ux - middle[1] * uy, middle[0] * uy + middle[1] * ux],
    size: [a[1] - a[0], b[1] - b[0]], angle: Math.atan2(uy, ux) * 180 / Math.PI }, "size");
}
// The ellipse a Shapes ellipse is on the face: the one with the area, the middle and the spread of the area it closes round.
function ellipseOf(points) {
  const loop = ring(points);
  if (loop.length < 3) return null;
  const mx = loop.reduce((sum, [x]) => sum + x, 0) / loop.length, my = loop.reduce((sum, [, y]) => sum + y, 0) / loop.length;
  let area = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  loop.forEach(([px, py], index) => {
    const [qx, qy] = loop[(index + 1) % loop.length];
    const x0 = px - mx, y0 = py - my, x1 = qx - mx, y1 = qy - my, step = x0 * y1 - x1 * y0;
    area += step; sx += (x0 + x1) * step; sy += (y0 + y1) * step;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * step; syy += (y0 * y0 + y0 * y1 + y1 * y1) * step;
    sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * step;
  });
  area /= 2;
  if (Math.abs(area) < 1e-9) return null;
  const cx = sx / (6 * area), cy = sy / (6 * area);
  const xx = sxx / (12 * area) - cx * cx, yy = syy / (12 * area) - cy * cy, xy = sxy / (24 * area) - cx * cy;
  const middle = (xx + yy) / 2, spread = Math.hypot((xx - yy) / 2, xy);
  const shape = squared({ kind: "ellipse", center: [cx + mx, cy + my],
    radii: [2 * Math.sqrt(Math.max(0, middle + spread)), 2 * Math.sqrt(Math.max(0, middle - spread))],
    angle: Math.atan2(2 * xy, xx - yy) * 90 / Math.PI }, "radii");
  // A circle is turned no way at all.
  return shape.radii[0] === shape.radii[1] ? { ...shape, angle: 0 } : shape;
}

// A mark as a shape, from its points `[u, v]` in the face's frame and the part's units.
function shapeOf(item, points, tolerance) {
  if (item.kind === "text") return { kind: "text", at: tenths(points[0]), text: String(item.text ?? "") };
  if (item.kind === "area") return polygonOf(points.slice(0, item.outline ?? points.length), tolerance);
  if (item.shape === "line" || item.shape === "arrow") return { kind: item.shape, from: tenths(points[0]), to: tenths(points.at(-1)) };
  if (item.closed && item.shape === "rectangle") return rectangleOf(points) ?? polygonOf(points, tolerance);
  if (item.closed && item.shape === "ellipse") return ellipseOf(points) ?? polygonOf(points, tolerance);
  return item.closed ? polygonOf(points, tolerance) : polylineOf(points, tolerance);
}

/**
 * The marks drawn on a face, as shapes in each face's own coordinates: a face for each, with the shapes on it in the order
 * they were drawn. An arrow is said once, by its line (the first of its group); a Shapes rectangle, ellipse, line, arrow
 * and text keep their own shape, a closed stroke or a fill is a polygon, any other stroke a polyline.
 *
 * @param {readonly import("./annotation3d.js").AnnotationItem[]} items  The annotation's ink, as `projectAnnotations` makes it.
 * @param {{ units?: string, labelOf?: ((ref: string) => string | null) | null }} [options]  `units`: the part's ("mm", the
 *   default, or "in"; the model's coordinates are millimetres). `labelOf`: what the renderer calls a face by a touch's reference
 *   token ("Hole (6) · face 12", or its chip's label; "" for a face it has no name for, which goes by its token), and null for a
 *   reference that names no face (an edge). Without it no touch is a face's, and no mark is said to be on one.
 * @returns {FaceShapes[]}
 */
export function faceShapesOf(items, { units = "mm", labelOf = null } = {}) {
  const scale = 1 / (MILLIMETRES[units] ?? 1);
  const tolerance = ON_FACE / scale;
  const faces = [];
  const arrows = new Set();
  for (const item of items) {
    if (item.shape === "arrow" && item.group) {
      if (arrows.has(item.group)) continue;
      arrows.add(item.group);
    }
    const on = faceOf(item.touches, labelOf);
    const under = on && item.level && item.under ? pointsOf(item.under) : null;
    if (!under?.length || !liesOn(under, item.level, tolerance)) continue;
    let entry = faces.find(each => each.face === on.face && samePlane(each.frame, item.level, tolerance));
    if (!entry) faces.push(entry = { ...on, frame: frameOf(item.level), shapes: [] });
    const { origin, u, v } = entry.frame;
    const points = under.map(point => { const offset = minus(point, origin); return [dot(offset, u) * scale, dot(offset, v) * scale]; });
    const shape = shapeOf(item, points, ON_FACE);
    if (shape) entry.shapes.push(shape);
  }
  return faces.map(({ face, label, frame, shapes }) => ({ face, label, shapes, frame: {
    origin: frame.origin.map(value => tenth(value * scale)), u: frame.u.map(thousandth), v: frame.v.map(thousandth), normal: frame.normal.map(thousandth),
  } }));
}

const number = value => String(tenth(value));
const at = ([u, v]) => `(${number(u)}, ${number(v)})`;
const triple = (values, round) => `(${values.map(value => String(round(value))).join(", ")})`;
// A shape as the agent reads it.
function said(shape) {
  if (shape.kind === "polygon" || shape.kind === "polyline") return `${shape.kind} ${shape.points.map(at).join(" → ")}`;
  if (shape.kind === "rectangle") return `rectangle centred at ${at(shape.center)}, ${number(shape.size[0])} × ${number(shape.size[1])}, turned ${number(shape.angle)}°`;
  if (shape.kind === "ellipse") return `ellipse centred at ${at(shape.center)}, radii ${number(shape.radii[0])} × ${number(shape.radii[1])}, turned ${number(shape.angle)}°`;
  if (shape.kind === "text") return `text ${JSON.stringify(shape.text)} at ${at(shape.at)}`;
  return `${shape.kind} from ${at(shape.from)} to ${at(shape.to)}`;
}

/**
 * The marks on each face as the agent gets them, beside the picture: a heading in the part's units, then each face's label
 * and its plane, and a line for each shape on it. Empty with no mark on a face.
 *
 * @param {readonly FaceShapes[]} groups  `faceShapesOf`'s.
 * @param {string} [units]  The part's ("mm" or "in").
 */
export function faceShapesText(groups, units = "mm") {
  if (!groups.length) return "";
  return [`Marks on the model, in each face's own coordinates (${units || "mm"}):`, ...groups.flatMap(({ label, frame, shapes }) => [
    `${label}: plane through ${triple(frame.origin, tenth)}, normal ${triple(frame.normal, thousandth)}, u along ${triple(frame.u, thousandth)}, v along ${triple(frame.v, thousandth)}`,
    ...shapes.map(shape => `- ${said(shape)}`),
  ])].join("\n");
}
