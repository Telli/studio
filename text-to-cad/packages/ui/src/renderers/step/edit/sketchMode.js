/**
 * Sketch mode's rules, pure: a constrained sketch (`cadgen.sketch`, solved by `cadgen/edit`) read
 * for drawing, what a click lands on (an existing point, a curve, a line's midpoint), what a
 * stroke infers (a line drawn horizontal), what each sketch tool sends, which dimension Smart
 * Dimension makes of what is picked, which relations a selection can take, where a dimension is
 * drawn, and what the agent is told. Everything is in the sketch's own units, on its plane.
 */

/** The sketch tools, as SolidWorks' Sketch tab names them, and what each asks for, click by click. */
export const SKETCH_TOOLS = Object.freeze([
  { id: "line", label: "Line", prompts: ["Click where the line starts.", "Click where it ends. Keep clicking to chain lines; Escape stops."] },
  { id: "rectangle", label: "Corner Rectangle", prompts: ["Click a corner of the rectangle.", "Click the opposite corner."] },
  { id: "center_rectangle", label: "Center Rectangle", prompts: ["Click the center of the rectangle.", "Click a corner."] },
  { id: "circle", label: "Circle", prompts: ["Click the center of the circle.", "Click to set its radius."] },
  { id: "arc", label: "Centerpoint Arc", prompts: ["Click the center of the arc.", "Click where the arc starts.", "Click where it ends."] },
  { id: "slot", label: "Straight Slot", prompts: ["Click the center of one end.", "Click the center of the other end.", "Click to set its width."] },
  { id: "centerline", label: "Centerline", prompts: ["Click where the centerline starts.", "Click where it ends."] },
  { id: "point", label: "Point", prompts: ["Click to place a point."] },
  { id: "dimension", label: "Smart Dimension", prompts: ["Pick a line, a circle, or two items to dimension.", "Pick a second item, or click to place the dimension.", "Click to place the dimension."] },
  { id: "fillet", label: "Sketch Fillet", prompts: ["Click a corner to round, or the first of two lines that meet.", "Click the second line."] },
  { id: "trim", label: "Trim Entities", prompts: ["Click the part of a curve to cut away. It is cut back to the curves that cross it; a curve nothing crosses is deleted."] },
  { id: "offset", label: "Offset Entities", prompts: ["Click a line, an arc or a circle to offset it, and the chain it is part of."] },
  { id: "mirror", label: "Mirror Entities", prompts: ["Click the entities to mirror.", "Click more of them, or the centerline to mirror about."] },
]);

/** The tools that change what is drawn rather than draw: each takes its own clicks (see `SketchOverlay.jsx`). */
export const MODIFY_TOOLS = Object.freeze(["fillet", "trim", "offset", "mirror"]);

/** The size a sketch tool uses until one is typed, in the part's units: a fillet's radius, an offset's distance. */
export const toolSize = (typed, units, tool) => String(typed ?? "").trim()
  || (units === "in" ? (tool === "fillet" ? "0.1" : "0.06") : (tool === "fillet" ? "2" : "1"));

// How near, as a share of the sketch's size, two places are one.
const nearness = state => 1e-6 * Math.max(1, ...(state?.points || []).flatMap(point => [Math.abs(point.x), Math.abs(point.y)]));

export const sketchTool = id => SKETCH_TOOLS.find(tool => tool.id === id) || null;

/** How many clicks a drawing tool takes; a line chains, so its count restarts from its end. */
export const TOOL_CLICKS = Object.freeze({ line: 2, centerline: 2, rectangle: 2, center_rectangle: 2, circle: 2, arc: 3, slot: 3, point: 1 });

const KIND_NAMES = Object.freeze({ line: "line", circle: "circle", arc: "arc" });
// A line drawn within this many degrees of level, or of plumb, is drawn so (and kept so).
export const INFER_DEGREES = 4;

const hypot = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const unit = a => { const length = Math.hypot(a[0], a[1]) || 1; return [a[0] / length, a[1] / length]; };
const at = point => [point.x, point.y];

/**
 * The sketch as drawing reads it: its points by name, and each curve with its points in place
 * (a line's two ends, a circle's center and radius, an arc's center, ends and radius).
 */
export function sketchGeometry(state) {
  const points = new Map((state?.points || []).map(point => [point.id, point]));
  const curves = (state?.curves || []).map(curve => {
    const base = { id: curve.id, kind: curve.kind, construction: Boolean(curve.construction), defined: Boolean(curve.defined) };
    // A fillet's arc, worked out from its lines: its places, no points of its own.
    if (curve.derived) return { ...base, derived: curve.derived, c: curve.c, s: curve.s, e: curve.e, r: curve.radius, clockwise: Boolean(curve.clockwise), dimension: curve.dimension };
    // A line drawn up to the fillet at an end (`view`), its ends still at the corner.
    if (curve.kind === "line") return { ...base, a: at(points.get(curve.start)), b: at(points.get(curve.end)), start: curve.start, end: curve.end, view: curve.shown || null };
    if (curve.kind === "circle") return { ...base, c: at(points.get(curve.center)), r: curve.radius, center: curve.center };
    return { ...base, c: at(points.get(curve.center)), s: at(points.get(curve.start)), e: at(points.get(curve.end)), r: curve.radius,
      clockwise: Boolean(curve.clockwise), center: curve.center, start: curve.start, end: curve.end };
  });
  return { points, curves };
}

/** An arc's start angle and sweep, in radians, negative when it turns clockwise. */
export function arcSweep(curve) {
  const a0 = Math.atan2(curve.s[1] - curve.c[1], curve.s[0] - curve.c[0]);
  const a1 = Math.atan2(curve.e[1] - curve.c[1], curve.e[0] - curve.c[0]);
  let sweep = (a1 - a0) % (2 * Math.PI);
  if (sweep <= 0) sweep += 2 * Math.PI;
  return { start: a0, sweep: curve.clockwise ? sweep - 2 * Math.PI : sweep };
}

function onArc(curve, angle) {
  const { start, sweep } = arcSweep(curve);
  let offset = (angle - start) % (2 * Math.PI);
  if (sweep >= 0) { if (offset < 0) offset += 2 * Math.PI; return offset <= sweep; }
  if (offset > 0) offset -= 2 * Math.PI;
  return offset >= sweep;
}

/** The point of a curve nearest a place, and how far it is. */
export function nearestOnCurve(curve, place) {
  if (curve.kind === "line") {
    const [a, b] = curve.view || [curve.a, curve.b];
    const d = sub(b, a);
    const length = dot(d, d);
    const t = length ? Math.max(0, Math.min(1, dot(sub(place, a), d) / length)) : 0;
    const point = add(a, scale(d, t));
    return { point, distance: hypot(point, place) };
  }
  const toward = sub(place, curve.c);
  const point = add(curve.c, scale(unit(toward), curve.r));
  if (curve.kind === "circle" || onArc(curve, Math.atan2(toward[1], toward[0]))) return { point, distance: hypot(point, place) };
  const ends = [curve.s, curve.e].map(end => ({ point: end, distance: hypot(end, place) }));
  return ends[0].distance <= ends[1].distance ? ends[0] : ends[1];
}

/**
 * What a click at `place` lands on, within `tolerance` (in sketch units: a few pixels on screen),
 * as a CAD tool's inference reads it: an existing point (shared, not a new one), a line's
 * midpoint, or a curve (a new point kept on it); else a new point where it was clicked.
 * `exclude` names points a stroke must not land on (its own start).
 */
export function snap(state, place, tolerance, { exclude = [] } = {}) {
  const { points, curves } = sketchGeometry(state);
  let best = null;
  for (const point of points.values()) {
    if (exclude.includes(point.id)) continue;
    const distance = hypot(at(point), place);
    if (distance <= tolerance && (!best || distance < best.distance)) best = { distance, ref: { point: point.id, at: at(point) } };
  }
  if (best) return best.ref;
  for (const curve of curves) {
    if (curve.kind !== "line" || curve.view) continue;
    const middle = scale(add(curve.a, curve.b), 0.5);
    const distance = hypot(middle, place);
    if (distance <= tolerance && (!best || distance < best.distance)) best = { distance, ref: { at: middle, on: curve.id, midpoint: true } };
  }
  if (best) return best.ref;
  for (const curve of curves) {
    if (curve.derived) continue;
    const { point, distance } = nearestOnCurve(curve, place);
    if (distance <= tolerance && (!best || distance < best.distance)) best = { distance, ref: { at: point, on: curve.id } };
  }
  return best ? best.ref : { at: [...place] };
}

/** A line's end drawn within a few degrees of level or plumb, put on it, with the relation that keeps it so. */
export function inferLine(start, end, degrees = INFER_DEGREES) {
  const d = sub(end, start);
  if (!d[0] && !d[1]) return { end, relation: null };
  const slope = Math.tan((degrees * Math.PI) / 180);
  if (Math.abs(d[1]) <= slope * Math.abs(d[0])) return { end: [end[0], start[1]], relation: "horizontal" };
  if (Math.abs(d[0]) <= slope * Math.abs(d[1])) return { end: [start[0], end[1]], relation: "vertical" };
  return { end, relation: null };
}

/** Where a point ref is: an existing point's place, or the place clicked. */
export const refAt = (state, ref) => (ref?.point ? at(sketchGeometry(state).points.get(ref.point) || { x: 0, y: 0 }) : ref?.at || [0, 0]);

// A ref as the server takes it: an existing point by name, or a place (and the curve it is on).
const plain = ref => (ref.point ? { point: ref.point } : { at: [...ref.at], ...(ref.on ? { on: ref.on } : {}), ...(ref.midpoint ? { midpoint: true } : {}) });

/**
 * The change a drawing tool sends once it has its clicks (`picks`, refs from `snap`): an entity
 * drawn (`cadgen/edit`'s `draw`), with what it infers. `options.construction` draws it for
 * construction; `options.clockwise` says which way an arc was swept.
 */
export function drawOp(tool, picks, state, { construction = false, clockwise = false } = {}) {
  const built = construction ? { construction: true } : {};
  const [first, second, third] = picks;
  switch (tool) {
    case "line":
    case "centerline": {
      const start = refAt(state, first);
      const inferred = second.point || second.on ? { end: refAt(state, second), relation: null } : inferLine(start, second.at);
      const end = second.point || second.on ? plain(second) : { at: inferred.end };
      return { kind: "draw", entity: tool, start: plain(first), end, ...built,
        relations: inferred.relation ? [{ kind: inferred.relation }] : [] };
    }
    case "rectangle":
      return { kind: "draw", entity: "rectangle", corner: plain(first), opposite: plain(second), ...built };
    case "center_rectangle":
      return { kind: "draw", entity: "center_rectangle", center: plain(first), corner: plain(second), ...built };
    case "circle":
      return { kind: "draw", entity: "circle", center: plain(first), radius: hypot(refAt(state, first), refAt(state, second)), ...built };
    case "arc": {
      const center = refAt(state, first);
      const start = refAt(state, second);
      const radius = hypot(center, start);
      const end = third.point ? plain(third) : { at: add(center, scale(unit(sub(refAt(state, third), center)), radius)) };
      return { kind: "draw", entity: "arc", center: plain(first), start: plain(second), end, clockwise: Boolean(clockwise), ...built };
    }
    case "slot": {
      const a = refAt(state, first);
      const b = refAt(state, second);
      const along = unit(sub(b, a));
      const radius = Math.abs(cross(along, sub(refAt(state, third), a)));
      return { kind: "draw", entity: "slot", center1: plain(first), center2: plain(second), radius, ...built };
    }
    case "point":
      return { kind: "draw", entity: "point", at: plain(first), ...built };
    default:
      return null;
  }
}

/** What Smart Dimension measures, as its value starts: a length, a radius, a distance, an angle in degrees. */
export function measure(state, dimension, refs) {
  const { points, curves } = sketchGeometry(state);
  const curve = id => curves.find(each => each.id === id);
  const place = id => (points.has(id) ? at(points.get(id)) : curve(id)?.c);
  const [a, b] = refs;
  switch (dimension) {
    case "length": { const line = curve(a); return hypot(line.a, line.b); }
    case "radius": return curve(a).r;
    case "diameter": return curve(a).r * 2;
    case "horizontal_distance": return Math.abs(place(b)[0] - place(a)[0]);
    case "vertical_distance": return Math.abs(place(b)[1] - place(a)[1]);
    case "distance": {
      const lineA = curve(a)?.kind === "line" ? curve(a) : null;
      const lineB = curve(b)?.kind === "line" ? curve(b) : null;
      if (lineA && lineB) return Math.abs(cross(unit(sub(lineB.b, lineB.a)), sub(lineA.a, lineB.a)));
      const line = lineA || lineB;
      if (line) {
        const point = place(line === lineA ? b : a);
        return Math.abs(cross(unit(sub(line.b, line.a)), sub(point, line.a)));
      }
      return hypot(place(a), place(b));
    }
    case "angle": {
      const lineA = curve(a);
      const lineB = curve(b);
      const u = sub(lineA.b, lineA.a);
      const v = sub(lineB.b, lineB.a);
      return (Math.atan2(Math.abs(cross(u, v)), dot(u, v)) * 180) / Math.PI;
    }
    default:
      return 0;
  }
}

/**
 * The dimension Smart Dimension makes of what is picked, as SolidWorks makes it: a line's
 * length, a circle's diameter, an arc's radius; between two points (or centers) the horizontal
 * distance when it is placed above or below them, the vertical one beside them, the straight one
 * between; a point and a line their distance; two lines the angle between them, or their distance
 * when they are parallel. `place` is where the pointer is, to place it. Null when it cannot.
 */
export function dimensionFor(state, picks, place = null) {
  const { points, curves } = sketchGeometry(state);
  const curve = id => curves.find(each => each.id === id);
  const kindOf = id => (points.has(id) ? "point" : curve(id)?.kind);
  const make = (dimension, refs) => ({ dimension, refs, value: measure(state, dimension, refs) });
  if (picks.some(id => curve(id)?.derived)) return null;
  if (picks.length === 1) {
    const kind = kindOf(picks[0]);
    if (kind === "line") return make("length", picks);
    if (kind === "circle") return make("diameter", picks);
    if (kind === "arc") return make("radius", picks);
    return null;
  }
  if (picks.length !== 2) return null;
  const [a, b] = picks;
  const kinds = [kindOf(a), kindOf(b)];
  // A circle or an arc beside a point or another of them is measured at its center.
  const centered = picks.map((id, index) => (kinds[index] === "circle" || kinds[index] === "arc" ? curve(id).center : id));
  if (kinds.every(kind => kind === "line")) {
    const u = unit(sub(curve(a).b, curve(a).a));
    const v = unit(sub(curve(b).b, curve(b).a));
    return Math.abs(cross(u, v)) < 1e-6 ? make("distance", picks) : make("angle", picks);
  }
  if (kinds.includes("line")) {
    const other = kinds[0] === "line" ? centered[1] : centered[0];
    const line = kinds[0] === "line" ? a : b;
    return make("distance", [other, line]);
  }
  const [p, q] = centered.map(id => at(points.get(id)));
  if (place) {
    const [xLow, xHigh] = [Math.min(p[0], q[0]), Math.max(p[0], q[0])];
    const [yLow, yHigh] = [Math.min(p[1], q[1]), Math.max(p[1], q[1])];
    const beside = place[0] < xLow || place[0] > xHigh;
    const aboveOrBelow = place[1] < yLow || place[1] > yHigh;
    if (aboveOrBelow && !beside) return make("horizontal_distance", centered);
    if (beside && !aboveOrBelow) return make("vertical_distance", centered);
  }
  return make("distance", centered);
}

/**
 * The relations SolidWorks' Add Relations offers for a selection, in its order: Horizontal and
 * Vertical for a line or two points, Coincident and Midpoint for a point and a line, Tangent for a
 * line and an arc or circle, Parallel, Perpendicular and Equal for two lines, and so on.
 */
export function relationsFor(state, selection) {
  const { points, curves } = sketchGeometry(state);
  if (selection.some(id => curves.find(curve => curve.id === id)?.derived)) return [];
  const kinds = selection.map(id => (points.has(id) ? "point" : curves.find(curve => curve.id === id)?.kind)).filter(Boolean);
  if (kinds.length !== selection.length || !kinds.length) return [];
  const count = kind => kinds.filter(each => each === kind).length;
  const round = count("circle") + count("arc");
  const offer = [];
  const add_ = (relation, label = relation[0].toUpperCase() + relation.slice(1)) => offer.push({ relation, label });
  if (kinds.length === 1) {
    if (kinds[0] === "line") { add_("horizontal"); add_("vertical"); }
    if (kinds[0] === "point" && selection[0] !== "Origin") add_("fix");
    return offer;
  }
  if (kinds.length === 2) {
    if (count("point") === 2) { add_("horizontal"); add_("vertical"); add_("coincident"); }
    if (count("point") === 1 && count("line") === 1) { add_("coincident"); add_("midpoint"); }
    if (count("point") === 1 && round === 1) { add_("coincident"); add_("concentric"); }
    if (count("line") === 2) { add_("parallel"); add_("perpendicular"); add_("equal"); }
    if (count("line") === 1 && round === 1) add_("tangent");
    if (round === 2) { add_("tangent"); add_("concentric"); add_("equal"); }
    return offer;
  }
  if (kinds.length === 3 && count("point") === 2 && count("line") === 1) add_("symmetric");
  return offer;
}

/** The relations and dimensions on what is selected, for the PropertyManager's Existing Relations. */
export function relationsOn(state, selection) {
  const wanted = new Set(selection);
  return [...(state?.relations || []), ...(state?.dimensions || [])].filter(item => item.refs.some(ref => wanted.has(ref)));
}

// A relation as SolidWorks lists it: "Horizontal1", "Coincident2"; a dimension by its value.
const RELATION_WORDS = Object.freeze({ horizontal_distance: "Horizontal distance", vertical_distance: "Vertical distance" });
export const relationLabel = item => RELATION_WORDS[item.kind] && item.value !== undefined ? `${item.id}, ${RELATION_WORDS[item.kind].toLowerCase()}` : item.id;

/** A sketch value as its dimension shows it: an angle in degrees, a size to the part's precision. */
export function formatValue(value, units, dimension) {
  if (!Number.isFinite(value)) return "";
  if (dimension === "angle") return `${Number(value.toFixed(1))}°`;
  const places = units === "in" ? 3 : 2;
  const text = Number(value.toFixed(places)).toString();
  if (dimension === "diameter") return `Ø${text}`;
  if (dimension === "radius" || dimension === "fillet") return `R${text}`;
  return text;
}

/** The middle of a sketch's drawn curves, to place a dimension away from the shape. */
export function sketchCenter(state) {
  const { curves } = sketchGeometry(state);
  const places = curves.flatMap(curve => (curve.kind === "line" ? [curve.a, curve.b] : [curve.c]));
  if (!places.length) return [0, 0];
  return scale(places.reduce(add, [0, 0]), 1 / places.length);
}

/**
 * Where a dimension is drawn, in the sketch's units: its extension lines, its dimension line
 * (an arrow at each end, `single` for a radius's one), or the arc of an angle, and where its value
 * goes, set `gap` away from what it measures. It goes on the side away from the shape unless
 * `side` says (1 or -1: above or below a horizontal one, right or left of a vertical one, along a
 * line's left-hand normal or against it), and `level` steps it further out, so dimensions stacked
 * on one side do not cover each other.
 */
export function dimensionLayout(state, dimension, gap, { side = 0, level = 0 } = {}) {
  const { points, curves } = sketchGeometry(state);
  const curve = id => curves.find(each => each.id === id);
  const place = id => (points.has(id) ? at(points.get(id)) : curve(id)?.c);
  const middle = sketchCenter(state);
  const out = gap * (1 + level * 1.15);
  const aligned = (p, q) => {
    const d = unit(sub(q, p));
    const left = [-d[1], d[0]];
    const n = side ? scale(left, side) : dot(sub(scale(add(p, q), 0.5), middle), left) < 0 ? scale(left, -1) : left;
    const p1 = add(p, scale(n, out));
    const q1 = add(q, scale(n, out));
    return { lines: [[p, add(p1, scale(n, gap * 0.25))], [q, add(q1, scale(n, gap * 0.25))]], dimension: [p1, q1],
      anchor: add(scale(add(p1, q1), 0.5), scale(n, gap * 0.45)) };
  };
  const [a, b] = dimension.refs;
  switch (dimension.kind) {
    case "length": { const line = curve(a); return line ? aligned(line.a, line.b) : null; }
    case "horizontal_distance":
    case "vertical_distance": {
      const p = place(a);
      const q = place(b);
      if (!p || !q) return null;
      const axis = dimension.kind === "horizontal_distance" ? 1 : 0;
      const outward = side || ((p[axis] + q[axis]) / 2 >= middle[axis] ? 1 : -1);
      const level_ = (outward > 0 ? Math.max(p[axis], q[axis]) : Math.min(p[axis], q[axis])) + outward * out;
      const put = (point, value) => (axis === 1 ? [point[0], value] : [value, point[1]]);
      const p1 = put(p, level_);
      const q1 = put(q, level_);
      return { lines: [[p, put(p, level_ + outward * gap * 0.25)], [q, put(q, level_ + outward * gap * 0.25)]], dimension: [p1, q1],
        anchor: put(scale(add(p1, q1), 0.5), level_ + outward * gap * 0.45) };
    }
    case "distance": {
      const lineB = curve(b)?.kind === "line" ? curve(b) : null;
      const lineA = curve(a)?.kind === "line" ? curve(a) : null;
      const across = (from, line) => {
        const foot = nearestOnInfinite(line, from);
        const along = unit(sub(line.b, line.a));
        return { lines: [], dimension: [from, foot], anchor: add(scale(add(from, foot), 0.5), scale(along, gap * (0.6 + level * 1.15))) };
      };
      if (lineA && lineB) return across(scale(add(lineA.a, lineA.b), 0.5), lineB);
      if (lineB) return across(place(a), lineB);
      const p = place(a);
      const q = place(b);
      return p && q ? aligned(p, q) : null;
    }
    case "offset": {
      // Across from the first offset curve to the one it is offset from.
      const made = curve(dimension.refs[0]);
      const source = curve(dimension.refs[dimension.data?.count || 1]);
      if (!made || !source) return null;
      if (made.kind === "line" && source.kind === "line") {
        const from = scale(add(made.a, made.b), 0.5);
        const foot = nearestOnInfinite(source, from);
        return { lines: [], dimension: [foot, from], anchor: add(scale(add(from, foot), 0.5), scale(unit(sub(made.b, made.a)), gap * (0.6 + level * 1.15))) };
      }
      const toward = unit(made.kind === "arc" ? sub(scale(add(made.s, made.e), 0.5), made.c) : [Math.SQRT1_2, -Math.SQRT1_2]);
      const near = add(source.c, scale(toward, source.r));
      const far = add(made.c, scale(toward, made.r));
      return { lines: [], dimension: [near, far], anchor: add(far, scale(toward, gap * (0.8 + level))) };
    }
    case "fillet":
    case "radius":
    case "diameter": {
      const round = dimension.kind === "fillet" ? curves.find(each => each.id === dimension.data?.arc) : curve(a);
      if (!round) return null;
      const toward = unit(round.kind === "arc" ? sub(scale(add(round.s, round.e), 0.5), round.c) : [Math.SQRT1_2, Math.SQRT1_2]);
      const rim = add(round.c, scale(toward, round.r));
      const far = dimension.kind === "diameter" ? add(round.c, scale(toward, -round.r)) : round.c;
      return { lines: [], dimension: [far, rim], single: dimension.kind !== "diameter", anchor: add(rim, scale(toward, gap * (1 + level))) };
    }
    case "angle": {
      const lineA = curve(a);
      const lineB = curve(b);
      if (!lineA || !lineB) return null;
      const u = sub(lineA.b, lineA.a);
      const v = sub(lineB.b, lineB.a);
      const denominator = cross(u, v);
      if (Math.abs(denominator) < 1e-12) return null;
      const t = cross(sub(lineB.a, lineA.a), v) / denominator;
      const corner = add(lineA.a, scale(u, t));
      // Each ray from the corner toward the far end of its line.
      const ray = line => unit(sub(hypot(line.a, corner) > hypot(line.b, corner) ? line.a : line.b, corner));
      const r1 = ray(lineA);
      const r2 = ray(lineB);
      const radius = gap * (2.2 + level * 1.15);
      const from = Math.atan2(r1[1], r1[0]);
      let sweep = Math.atan2(r2[1], r2[0]) - from;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const half = from + sweep / 2;
      return { lines: [], arc: { center: corner, radius, from, sweep }, anchor: add(corner, [Math.cos(half) * (radius + gap * 0.6), Math.sin(half) * (radius + gap * 0.6)]) };
    }
    default:
      return null;
  }
}

/** Which side of what it measures a dimension placed at `place` goes on (see `dimensionLayout`). */
export function placedSide(state, dimension, place) {
  const { points, curves } = sketchGeometry(state);
  const curve = id => curves.find(each => each.id === id);
  const where = id => (points.has(id) ? at(points.get(id)) : curve(id)?.c);
  const [a, b] = dimension.refs;
  if (dimension.kind === "horizontal_distance" || dimension.kind === "vertical_distance") {
    const axis = dimension.kind === "horizontal_distance" ? 1 : 0;
    const p = where(a);
    const q = where(b);
    if (!p || !q) return 0;
    return place[axis] >= (p[axis] + q[axis]) / 2 ? 1 : -1;
  }
  const ends = dimension.kind === "length" ? [curve(a)?.a, curve(a)?.b] : dimension.kind === "distance" && !curve(b) ? [where(a), where(b)] : null;
  if (!ends || !ends[0] || !ends[1]) return 0;
  const d = unit(sub(ends[1], ends[0]));
  return dot(sub(place, ends[0]), [-d[1], d[0]]) >= 0 ? 1 : -1;
}

function nearestOnInfinite(line, place) {
  const d = sub(line.b, line.a);
  const length = dot(d, d) || 1;
  return add(line.a, scale(d, dot(sub(place, line.a), d) / length));
}

/** What is under the pointer, for picking and hovering: a point first, then a dimension's value, then a curve. */
export function hitTest(state, place, tolerance) {
  const { points, curves } = sketchGeometry(state);
  let best = null;
  for (const point of points.values()) {
    const distance = hypot(at(point), place);
    if (distance <= tolerance && (!best || distance < best.distance)) best = { id: point.id, distance };
  }
  if (best) return best.id;
  for (const curve of curves) {
    const { distance } = nearestOnCurve(curve, place);
    if (distance <= tolerance && (!best || distance < best.distance)) best = { id: curve.id, distance };
  }
  return best?.id || null;
}

// ---- Trim Entities and Offset Entities: what a click takes --------------------------------------

/** Where along a curve a place is: a line from 0 to 1, an arc or a circle in radians from its start, the way it turns. */
function alongCurve(curve, place) {
  if (curve.kind === "line") {
    const d = sub(curve.b, curve.a);
    return dot(sub(place, curve.a), d) / (dot(d, d) || 1);
  }
  const angle = Math.atan2(place[1] - curve.c[1], place[0] - curve.c[0]);
  if (curve.kind === "circle") return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const { start, sweep } = arcSweep(curve);
  const turn = sweep < 0 ? -1 : 1;
  return ((((angle - start) * turn) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

// A curve as points along it, to draw it whole.
function wholeCurve(curve) {
  if (curve.kind === "line") return curve.view || [curve.a, curve.b];
  const { start, sweep } = curve.kind === "circle" ? { start: 0, sweep: 2 * Math.PI } : arcSweep(curve);
  const steps = Math.max(12, Math.ceil(Math.abs(sweep) * 24));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = start + (sweep * index) / steps;
    return [curve.c[0] + curve.r * Math.cos(angle), curve.c[1] + curve.r * Math.sin(angle)];
  });
}

function spanOf(curve) {
  return curve.kind === "line" ? 1 : curve.kind === "circle" ? 2 * Math.PI : Math.abs(arcSweep(curve).sweep);
}

function lineCircle(p, q, c, r) {
  const d = sub(q, p);
  const f = sub(p, c);
  const a = dot(d, d);
  const b = 2 * dot(f, d);
  const disc = b * b - 4 * a * (dot(f, f) - r * r);
  if (a < 1e-24 || disc < 0) return [];
  const root = Math.sqrt(disc);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)].map(t => add(p, scale(d, t)));
}

function circleCircle(c1, r1, c2, r2) {
  const d = hypot(c1, c2);
  if (d < 1e-12 || d > r1 + r2 || d < Math.abs(r1 - r2)) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const m = add(c1, scale(sub(c2, c1), a / d));
  const n = [-(c2[1] - c1[1]) / d, (c2[0] - c1[0]) / d];
  return [add(m, scale(n, h)), add(m, scale(n, -h))];
}

/** Where two curves meet, each as drawn (a line between its ends, an arc along its sweep). */
function meetings(first, second, tolerance) {
  const on = (curve, place) => {
    const t = alongCurve(curve, place);
    if (curve.kind === "line") return t >= -tolerance / (hypot(curve.a, curve.b) || 1) && t <= 1 + tolerance / (hypot(curve.a, curve.b) || 1);
    if (curve.kind === "circle") return true;
    return t <= spanOf(curve) + tolerance / (curve.r || 1) || t >= 2 * Math.PI - tolerance / (curve.r || 1);
  };
  let found;
  if (first.kind === "line" && second.kind === "line") {
    const d = sub(first.b, first.a);
    const e = sub(second.b, second.a);
    const across = cross(d, e);
    found = Math.abs(across) < 1e-12 ? [] : [add(first.a, scale(d, cross(sub(second.a, first.a), e) / across))];
  } else if (first.kind === "line" || second.kind === "line") {
    const [line, round] = first.kind === "line" ? [first, second] : [second, first];
    found = lineCircle(line.a, line.b, round.c, round.r);
  } else {
    found = circleCircle(first.c, first.r, second.c, second.r);
  }
  return found.filter(place => on(first, place) && on(second, place));
}

/**
 * The piece of a curve Trim Entities cuts away when it is clicked at `place`, as points along it
 * to draw: up to the nearest curves that cross it either side (or its ends); the whole curve
 * when nothing crosses it (it is deleted). Null for what cannot be trimmed (a fillet's arc).
 */
export function trimPiece(state, id, place, tolerance = nearness(state) * 10) {
  const { curves } = sketchGeometry(state);
  const curve = curves.find(each => each.id === id);
  if (!curve || curve.derived) return null;
  const span = spanOf(curve);
  const slack = curve.kind === "line" ? tolerance / (hypot(curve.a, curve.b) || 1) : tolerance / (curve.r || 1);
  const cuts = [];
  for (const other of curves) {
    if (other.id === id || other.derived) continue;
    for (const where of meetings(curve, other, tolerance)) {
      let t = alongCurve(curve, where);
      if (curve.kind === "arc" && t > 2 * Math.PI - slack) t -= 2 * Math.PI;
      if (curve.kind !== "circle" && (t <= slack || t >= span - slack)) continue;
      if (!cuts.some(each => Math.abs(each - t) <= slack)) cuts.push(t);
    }
  }
  cuts.sort((p, q) => p - q);
  const whole = { id, points: wholeCurve(curve), whole: true };
  let clicked = Math.max(0, Math.min(span, alongCurve(curve, place)));
  if (curve.kind === "arc" && alongCurve(curve, place) > span) clicked = alongCurve(curve, place) - span < 2 * Math.PI - alongCurve(curve, place) ? span : 0;
  let low;
  let high;
  if (curve.kind === "circle") {
    if (cuts.length < 2) return whole;
    const k = cuts.findIndex((each, index) => index < cuts.length - 1 && each <= clicked && clicked < cuts[index + 1]);
    [low, high] = k >= 0 ? [cuts[k], cuts[k + 1]] : [cuts[cuts.length - 1], cuts[0] + 2 * Math.PI];
  } else {
    if (!cuts.length) return whole;
    low = Math.max(0, ...cuts.filter(each => each < clicked));
    high = Math.min(span, ...cuts.filter(each => each > clicked));
  }
  if (curve.kind === "line") {
    const d = sub(curve.b, curve.a);
    return { id, points: [add(curve.a, scale(d, low)), add(curve.a, scale(d, high))], whole: false };
  }
  const start = curve.kind === "circle" ? 0 : arcSweep(curve).start;
  const turn = curve.kind === "arc" && arcSweep(curve).sweep < 0 ? -1 : 1;
  const from = start + turn * low;
  const sweep = turn * (high - low);
  const steps = Math.max(8, Math.ceil(Math.abs(sweep) * 24));
  return { id, whole: false, points: Array.from({ length: steps + 1 }, (_, index) => {
    const angle = from + (sweep * index) / steps;
    return [curve.c[0] + curve.r * Math.cos(angle), curve.c[1] + curve.r * Math.sin(angle)];
  }) };
}

/** The curves joined end to end with `id` (lines and arcs meeting at a point or one place), as Offset Entities' Select chain takes them. */
export function chainOf(state, id, tolerance = nearness(state) * 10) {
  const { curves } = sketchGeometry(state);
  const start = curves.find(each => each.id === id);
  if (!start || start.derived) return [];
  if (start.kind === "circle") return [id];
  const ends = curve => (curve.kind === "line" ? [curve.a, curve.b] : curve.kind === "arc" ? [curve.s, curve.e] : []);
  const joined = (p, q) => curves.filter(each => !each.derived && each.kind !== "circle" && each.id !== p.id
    && ends(each).some(end => ends(p).some(other => hypot(end, other) <= tolerance)) && q(each));
  const chain = [id];
  for (let index = 0; index < chain.length; index += 1) {
    const curve = curves.find(each => each.id === chain[index]);
    for (const next of joined(curve, each => !chain.includes(each.id))) chain.push(next.id);
  }
  return chain;
}

/** An entity as a CAD tool says it in a sentence: "a line", "Line3". */
export const entityWord = (state, id) => {
  const curve = (state?.curves || []).find(each => each.id === id);
  return curve ? KIND_NAMES[curve.kind] || "curve" : "point";
};

function counted(count, one, many = `${one}s`) {
  if (count !== 1) return `${count} ${many}`;
  return `${/^[aeiou]/.test(one) ? "an" : "a"} ${one}`;
}

function listed(parts) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * What the agent is told when the engineer leaves a sketch they changed: the sketch, where it is
 * written, and what they did, counted ("drew 4 lines and a circle, added 3 dimensions").
 * `made` counts the session's changes by kind: lines, circles, arcs, points, dimensions,
 * relations, corners rounded, curves trimmed, chains offset, entities mirrored, deleted, moved.
 */
export function sketchNote(session) {
  const made = session.made || {};
  const drew = [["line", "lines"], ["circle", "circles"], ["arc", "arcs"], ["point", "points"]]
    .filter(([one]) => made[one]).map(([one, many]) => counted(made[one], one, many));
  const added = [["dimension", "dimensions"], ["relation", "relations"]].filter(([one]) => made[one]).map(([one, many]) => counted(made[one], one, many));
  const parts = [];
  if (drew.length) parts.push(`drew ${listed(drew)}`);
  if (added.length) parts.push(`added ${listed(added)}`);
  if (made.value) parts.push(`changed ${counted(made.value, "dimension")}`);
  if (made.fillet) parts.push(`rounded ${counted(made.fillet, "corner")}`);
  if (made.trimmed) parts.push(`trimmed ${counted(made.trimmed, "curve")}`);
  if (made.offset) parts.push(`offset ${counted(made.offset, "chain")}`);
  if (made.mirrored) parts.push(`mirrored ${counted(made.mirrored, "entity", "entities")}`);
  if (made.moved) parts.push(`moved ${counted(made.moved, "point")}`);
  if (made.deleted) parts.push(`deleted ${counted(made.deleted, "item")}`);
  const where = `(${session.file}, line ${session.line})`;
  const plane = session.plane && session.plane !== "Plane" ? ` on the ${session.plane} Plane` : "";
  const done = parts.length ? `: ${parts.join(", ")}` : "";
  if (session.created) return `In edit mode I drew ${session.name}${plane} ${where}${done}.`;
  return `In edit mode I changed ${session.name} ${where}${done}.`;
}

/** What a sketch change counts as for the note: a stroke by what it draws, and the rest by kind. */
export function countChange(made, op) {
  const next = { ...made };
  const bump = (key, by = 1) => { next[key] = (next[key] || 0) + by; };
  if (op.kind === "draw") {
    if (op.entity === "rectangle" || op.entity === "center_rectangle") bump("line", 4);
    else if (op.entity === "slot") { bump("arc", 2); bump("line", 2); }
    else if (op.entity === "centerline") bump("line");
    else bump(op.entity);
  } else if (op.kind === "dimension") bump("dimension");
  else if (op.kind === "relate") bump("relation");
  else if (op.kind === "value") bump("value");
  else if (op.kind === "move") bump("moved", (op.points || []).length || 1);
  else if (op.kind === "delete") bump("deleted", (op.items || []).length || 1);
  else if (op.kind === "fillet") bump("fillet");
  else if (op.kind === "trim") bump("trimmed");
  else if (op.kind === "offset") bump("offset");
  else if (op.kind === "mirror") bump("mirrored", (op.items || []).length || 1);
  return next;
}
