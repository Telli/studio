/**
 * A part's drawing worked on its sheet (`SheetEditor.jsx`), as a SolidWorks drawing is: a view
 * dragged where it goes (the top, front and right views together, as `three_views` placed them; its
 * isometric, or a view placed by hand, on its own), a dimension picked and deleted, and Smart
 * Dimension between two points of a view, or on a circle seen round.
 *
 * The sheet is `cadgen.eng_drawing.sheet_payload`'s: sheet millimetres, y up; each view's box,
 * scale and snaps with the model points they are; each entity's handle naming the view or the
 * dimension that drew it, by where the drawing's script asked for it (`sources`). What these
 * rules make is the change `cadgen/edit/drawings.py` writes into the script.
 */

/** A dimension placed closer to what it measures than this (sheet mm) would sit on the lines it measures. */
export const DIMENSION_GAP_MM = 4;

const sameEnd = (a, b) => Boolean(a && b) && a[0] === b[0] && a[1] === b[1];
const round1 = value => Math.round(value * 10) / 10;

/** A view as a change names it: the call that placed it, and which of that call's views it is. */
export function viewRef(sheet, view) {
  const nth = sheet.views.filter(each => sameEnd(each.end, view.end)).indexOf(view);
  return { end: view.end, arranged: Boolean(view.arranged), offset: view.offset ?? null, at: view.at, name: view.name, nth: Math.max(0, nth) };
}

/** The views that move with `view`: `three_views`' top, front and right together; any other alone. */
export function movingTogether(sheet, view) {
  if (!view.arranged || view.name === "iso") return [view];
  return sheet.views.filter(each => each.arranged && each.name !== "iso" && sameEnd(each.end, view.end));
}

/** The view a point on the sheet is in, its box grown by `margin`: the smallest of any it is in. */
export function viewAt(sheet, point, margin = 0) {
  let best = null;
  for (const view of sheet?.views || []) {
    const [x0, x1, y0, y1] = view.box;
    if (point[0] < x0 - margin || point[0] > x1 + margin || point[1] < y0 - margin || point[1] > y1 + margin) continue;
    const area = (x1 - x0) * (y1 - y0);
    if (!best || area < best.area) best = { view, area };
  }
  return best?.view || null;
}

/** How far views may move by `by` and stay inside the sheet's frame, as the drawing refuses one off it. */
export function clampMove(sheet, views, by) {
  const [fx0, fx1, fy0, fy1] = sheet.frame;
  const low = [-Infinity, -Infinity];
  const high = [Infinity, Infinity];
  for (const { box: [x0, x1, y0, y1] } of views) {
    low[0] = Math.max(low[0], fx0 - x0); high[0] = Math.min(high[0], fx1 - x1);
    low[1] = Math.max(low[1], fy0 - y0); high[1] = Math.min(high[1], fy1 - y1);
  }
  const clamp = (value, axis) => (low[axis] > high[axis] ? 0 : Math.min(Math.max(value, low[axis]), high[axis]));
  return [clamp(by[0], 0), clamp(by[1], 1)];
}

/**
 * A view placed by hand, dragged, lines up with the sheet's other views when its centre comes
 * within `tolerance` of one's, across or up, as SolidWorks' drawing lines a view up with a dashed
 * line to the one it lines up with (`guides`: each from the view's new centre to the other's).
 */
export function alignMove(sheet, views, by, tolerance) {
  if (views.length !== 1) return { by, guides: [] };
  const [view] = views;
  const at = [view.at[0] + by[0], view.at[1] + by[1]];
  let across = null, up = null;
  for (const other of sheet.views) {
    if (other === view) continue;
    const dx = other.at[0] - at[0], dy = other.at[1] - at[1];
    if (Math.abs(dx) <= tolerance && (!across || Math.abs(dx) < Math.abs(across.d))) across = { d: dx, other };
    if (Math.abs(dy) <= tolerance && (!up || Math.abs(dy) < Math.abs(up.d))) up = { d: dy, other };
  }
  const moved = [by[0] + (across?.d || 0), by[1] + (up?.d || 0)];
  const placed = [view.at[0] + moved[0], view.at[1] + moved[1]];
  return { by: moved, guides: [across, up].filter(Boolean).map(({ other }) => [placed, other.at]) };
}

/** Each dimension on the sheet, by the call that asked for it: the handles that draw it, its view. */
export function sheetDimensions(sheet) {
  const found = new Map();
  for (const [handle, info] of Object.entries(sheet?.sources || {})) {
    if ((info.kind !== "dim" && info.kind !== "overall") || !info.end) continue;
    const key = `${info.kind}@${info.end[0]}:${info.end[1]}`;
    const entry = found.get(key) || { key, kind: info.kind, type: info.type || "linear", view: info.view, end: info.end, line: info.line, handles: [] };
    entry.handles.push(handle);
    found.set(key, entry);
  }
  return found;
}

/** What an entity on the sheet belongs to: a dimension (`{ dimension }`), a view (`{ view }`), or neither. */
export function ownerOf(sheet, dimensions, handle) {
  const info = handle ? sheet?.sources?.[handle] : null;
  if (!info) return null;
  if (info.kind === "dim" || info.kind === "overall") {
    const key = info.end ? `${info.kind}@${info.end[0]}:${info.end[1]}` : "";
    return dimensions.has(key) ? { dimension: dimensions.get(key) } : null;
  }
  const view = sheet.views.find(each => each.view === info.view);
  return view ? { view } : null;
}

/**
 * What Smart Dimension takes at a point in a view: a snap (a corner, or a circle's centre) within
 * `tolerance`, else a circle's rim (dimensioned by its size), else nothing.
 */
export function dimensionTarget(view, point, tolerance) {
  let best = null;
  for (const snap of view?.snaps || []) {
    const distance = Math.hypot(point[0] - snap.at[0], point[1] - snap.at[1]);
    if (distance <= tolerance && (!best || distance < best.distance)) best = { kind: "point", snap, distance };
  }
  if (best) return best;
  for (const circle of view?.circles || []) {
    const distance = Math.abs(Math.hypot(point[0] - circle.at[0], point[1] - circle.at[1]) - circle.radius);
    if (distance <= tolerance && (!best || distance < best.distance)) best = { kind: "circle", circle, distance };
  }
  return best;
}

/** A straight edge of a view, `[x1, y1, x2, y2]` on the sheet, as the two snaps at its ends, or null. */
export function edgeEnds(view, segment, tolerance = 1e-3) {
  const at = (x, y) => (view?.snaps || []).find(snap => Math.hypot(snap.at[0] - x, snap.at[1] - y) <= tolerance) || null;
  const first = at(segment[0], segment[1]);
  const second = at(segment[2], segment[3]);
  return first && second && first !== second ? [first, second] : null;
}

/**
 * Where a dimension between two points of a view goes, as Smart Dimension places it with the
 * pointer: above or below the pair it measures across (`h`), beside it it measures up (`v`); a
 * pair one above the other is only measured up, one beside the other only across. `offset` is
 * `View.dim`'s: from the farther point, its sign the side. `line` is where it is drawn, `value`
 * what it measures, in sheet millimetres.
 */
export function placeDimension(a, b, cursor, gap = DIMENSION_GAP_MM) {
  const xs = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const ys = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const spanX = xs[1] - xs[0], spanY = ys[1] - ys[0];
  const outX = cursor[0] < xs[0] ? xs[0] - cursor[0] : Math.max(0, cursor[0] - xs[1]);
  const outY = cursor[1] < ys[0] ? ys[0] - cursor[1] : Math.max(0, cursor[1] - ys[1]);
  const orientation = spanX < 1e-6 ? "v" : spanY < 1e-6 ? "h" : outY > outX ? "h" : outX > outY ? "v" : spanX >= spanY ? "h" : "v";
  if (orientation === "h") {
    const above = cursor[1] >= (ys[0] + ys[1]) / 2;
    const offset = above ? Math.max(cursor[1] - ys[1], gap) : Math.min(cursor[1] - ys[0], -gap);
    const y = (above ? ys[1] : ys[0]) + offset;
    return { orientation, offset, line: [[a[0], y], [b[0], y]], value: spanX };
  }
  const right = cursor[0] >= (xs[0] + xs[1]) / 2;
  const offset = right ? Math.max(cursor[0] - xs[1], gap) : Math.min(cursor[0] - xs[0], -gap);
  const x = (right ? xs[1] : xs[0]) + offset;
  return { orientation, offset, line: [[x, a[1]], [x, b[1]]], value: spanY };
}

/** A length on the sheet as its dimension reads it: true size (the view's scale undone), in the sheet's units. */
export function dimensionText(sheetMm, scale, units) {
  const size = sheetMm / (scale || 1);
  if (units === "in") return (size / 25.4).toFixed(3).replace(/^0(?=\.)/, "");
  return String(Math.round(size * 100) / 100);
}

/** Drag a view (and the views that move with it) by `by` sheet millimetres. */
export const moveEdit = (sheet, view, by) => ({ kind: "move", view: viewRef(sheet, view), by: [round1(by[0]), round1(by[1])] });

/** Delete a dimension, by the call that asked for it. */
export const deleteEdit = (sheet, dimension) => ({ kind: "delete", end: dimension.end,
  name: sheet.views.find(view => view.view === dimension.view)?.name || "" });

/**
 * Smart Dimension between two snaps of a view, placed as `placed` says (`placeDimension`). The
 * direction is written only where it is not the one the drawing would take on its own: whichever
 * way the pair spans more.
 */
export function dimensionEdit(sheet, view, first, second, placed) {
  const spans = Math.abs(second.at[0] - first.at[0]) >= Math.abs(second.at[1] - first.at[1]) ? "h" : "v";
  return { kind: "dim", view: viewRef(sheet, view), from: first.model, to: second.model,
    ...(placed.orientation !== spans ? { orientation: placed.orientation } : {}), offset: round1(placed.offset) };
}

/** Smart Dimension on a circle seen round: a full circle by its diameter, an arc by its radius. */
export const circleEdit = (sheet, view, circle) => ({ kind: circle.full ? "diameter" : "radius", view: viewRef(sheet, view),
  center: circle.model, radius: circle.size });

/** What the sheet editor's status line says, for the tool in hand and what is picked. */
export function sheetHint({ tool, first, selected, busy }) {
  if (busy) return "Drawing the sheet again.";
  if (tool === "dimension") {
    if (first) return "Pick the second point in the same view, or Escape to start again.";
    return "Pick a corner or a circle's centre in a view, a straight edge, or a circle for its size.";
  }
  if (selected) return "Delete takes the dimension off. Drag a view to move it.";
  return "Drag a view to move it. Pick a dimension to delete it, or use Smart Dimension to add one.";
}
