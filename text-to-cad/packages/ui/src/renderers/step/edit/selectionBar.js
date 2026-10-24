/**
 * The selection bar's rules, pure: what it offers beside a pick, when Quick Edit shows in the workspace, which
 * Part Navigator row a selection is, and where the bar stands (`EditSelectionBar.jsx` draws it; `StepSurface.jsx`
 * wires it). Picking a face, an edge or a feature with no command open offers a small bar beside it: Ask,
 * Add to context, Annotate and Edit.
 */
import { treeFeatures } from "./editMode.js";

/** How far the bar stands from what it is about (`GAP`), and from the view's edges and below the toolbar (`EDGE`), in px. */
export const SELECTION_BAR_GAP_PX = 10;
export const SELECTION_BAR_EDGE_PX = 8;

// What the bar is about. A part, a vertex or a plane is none of them.
const PICK_KINDS = Object.freeze(["face", "edge", "feature"]);
const BUSY_WORDS = "Wait for the change in progress to finish.";

// A row of the Part Navigator or the timeline is its own feature, if there is anything to edit in it.
const ownFeature = pick => (pick.kind === "feature" && pick.editable !== false ? pick.id : null);
const featureKey = feature => (feature && typeof feature === "object" ? feature.id : feature);

/**
 * What the bar offers beside the picks, in its order, each `{ id, enabled, reason? }` (`reason`: why it is held):
 * Ask, Add to context and Annotate, and Edit when there is one feature to edit. Nothing in Simple view, with
 * nothing picked, with a pick that is not a face, an edge or a feature, or while a command or a sketch is open
 * (`commandOpen`, `sketching`): the bar is for choosing what to do with a pick, and an open command is doing it.
 *
 * `picks`: `{ kind: "face" | "edge" | "feature", id }` each; a feature's `editable: false` says it has nothing to
 * edit. `featureOf(pick)`: the feature that made a pick, its id (null: not known), which is how a face
 * comes to have an Edit once the engine says which feature made it; a row of the Part Navigator or the timeline
 * is its own. Edit is Edit Parameters, on the one feature every pick is the work of; `busy` holds it while a
 * change is on its way, as the Part Navigator holds a double-click.
 *
 * @param {{ editing: boolean, picks?: { kind: string, id: string, editable?: boolean }[], commandOpen?: boolean,
 *   sketching?: boolean, featureOf?: ((pick: object) => string | { id: string } | null) | null, busy?: boolean }} state
 * @returns {{ id: "ask" | "add-context" | "annotate" | "edit", enabled: boolean, reason?: string }[]}
 */
export function selectionBarActions({ editing, picks, commandOpen = false, sketching = false, featureOf = null, busy = false }) {
  if (!editing || commandOpen || sketching) return [];
  if (!Array.isArray(picks) || !picks.length || !picks.every(pick => PICK_KINDS.includes(pick?.kind))) return [];
  const actions = [{ id: "ask", enabled: true }, { id: "add-context", enabled: true }, { id: "annotate", enabled: true }];
  const features = picks.map(pick => featureOf?.(pick) || ownFeature(pick));
  if (features.every(Boolean) && new Set(features.map(featureKey)).size === 1) {
    actions.push(busy ? { id: "edit", enabled: false, reason: BUSY_WORDS } : { id: "edit", enabled: true });
  }
  return actions;
}

/**
 * Whether Quick Edit shows. In the workspace (`editing`) only once the person has asked (`asked`: Ask, in the
 * bar or the toolbar), whatever is picked, and then even with nothing picked, on the part as a whole. In Simple
 * view as it always has: with a selection it can carry (`selectionActionVisible`).
 */
export function quickEditShown({ editing, asked, selectionActionVisible }) {
  return editing ? Boolean(asked) : Boolean(selectionActionVisible);
}

/**
 * The row of the Part Navigator (`featureTree`) that `selected`, the id the tree and the timeline select by, is, as the bar
 * sees a pick: `{ kind: "feature", id, feature, sketch, editable }`, or null for what is not a feature or a sketch (the
 * origin, a plane, a part of an assembly, nothing). `sketch` is the sketch a double-click on that row edits: a sketch of
 * its own, or the one a feature was made from when that sketch is what is selected. `editable`: there is something to
 * open, as a double-click on the row opens it: Edit Parameters on a feature a command made, Edit Sketch on a sketch
 * the script names. An assembly's parts are opened to be edited, so none of its features is.
 */
export function featurePick(tree, selected) {
  if (!selected) return null;
  for (const feature of treeFeatures(tree)) {
    const own = feature.id === selected;
    const nested = feature.kind !== "Sketch" && feature.sketch?.id === selected;
    if (!own && !nested) continue;
    const sketch = (nested || feature.kind === "Sketch") ? feature.sketch : null;
    const opens = sketch ? Boolean(sketch.constrained) : Boolean(feature.edit);
    return { kind: "feature", id: selected, feature, sketch, editable: !tree.assembly && opens };
  }
  return null;
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));

/**
 * Where the bar stands: `{ left, top }` in the view's pixels, or null where what it is about is out of the free part of the
 * view. Above the pick (`box`, its edges on the screen), centred on it and `gap` off; below it where there is no room above;
 * else right of it, else left of it: the first of these that lies inside the view (`bounds`, inset from its edges and below
 * the toolbar) and clear of every card over the view (`obstacles`, boxes like `box`). Where none is free, over the pick,
 * above it as far as the view allows. `size`: the bar's own.
 *
 * @param {{ box: object | null, size: { width: number, height: number }, bounds: object, obstacles?: object[], gap?: number }} input
 */
export function placeBar({ box, size, bounds, obstacles = [], gap = SELECTION_BAR_GAP_PX }) {
  if (!box || !overlaps(box, bounds)) return null;
  const { width, height } = size;
  const across = clamp((box.left + box.right) / 2 - width / 2, bounds.left, bounds.right - width);
  const along = clamp((box.top + box.bottom) / 2 - height / 2, bounds.top, bounds.bottom - height);
  const candidates = [
    { left: across, top: box.top - gap - height },
    { left: across, top: box.bottom + gap },
    { left: box.right + gap, top: along },
    { left: box.left - gap - width, top: along },
  ];
  const free = ({ left, top }) => left >= bounds.left && top >= bounds.top && left + width <= bounds.right && top + height <= bounds.bottom
    && !obstacles.some(obstacle => overlaps({ left, top, right: left + width, bottom: top + height }, obstacle));
  return candidates.find(free) || { left: across, top: clamp(candidates[0].top, bounds.top, bounds.bottom - height) };
}

// A point put where a matrix (as three.js lays out its 16 numbers, column by column) puts it.
const placed = ([x, y, z], e) => (e?.length === 16
  ? [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]
  : [x, y, z]);

/**
 * The eight corners of a box of the model (`{ min, max }`, the part's own units), put where `matrix` puts the part they
 * belong to (Explode moves its parts); none for what is not a box. The bar stands by where these fall on the screen.
 */
export function boundsCorners(bounds, matrix = null) {
  const { min, max } = bounds || {};
  const point = value => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(Number.isFinite);
  if (!point(min) || !point(max)) return [];
  return [min[0], max[0]].flatMap(x => [min[1], max[1]].flatMap(y => [min[2], max[2]].map(z => placed([x, y, z], matrix))));
}

/**
 * The box round some points of the model (`points`, in the part's own units) on the screen, in the view's pixels (`width` by
 * `height`) as the camera sees the part now (`runtime`: its camera, its model group, and three.js), or null where none of
 * them is in front of the camera.
 */
export function screenBox(runtime, points, width, height) {
  const { THREE, camera, modelGroup } = runtime;
  const point = new THREE.Vector3(), seen = new THREE.Vector3();
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [x, y, z] of points) {
    point.set(x, y, z).applyMatrix4(modelGroup.matrixWorld);
    // In front of the camera at all: its depth range is the model's, and a corner of a box can fall just past it.
    const inFront = seen.copy(point).applyMatrix4(camera.matrixWorldInverse).z < 0;
    point.project(camera);
    if (!inFront || !Number.isFinite(point.x + point.y)) continue;
    const px = ((point.x + 1) / 2) * width, py = ((1 - point.y) / 2) * height;
    left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
  }
  return Number.isFinite(left) ? { left, top, right, bottom } : null;
}
