/**
 * Where an FEA result's view meets the chrome over it: the file sidebar at the viewport's left (Study, an
 * assembly's Parts), and the tool strip with the stack under it at the top centre (the Reference, Clip). The
 * camera frames the model into the width the sidebar leaves and above the colour bar (`framingInset`, `runtime.framingInset`), and a load's label sits
 * at the outer end of its own arrows where that is in sight (`besideEnd`), never under that chrome, past the
 * view's edge nor on another label (`settleLabels`). Pure but for what reads the page (`chromeCover`,
 * `colourBarCover`, `panelInset`, `framingInset`).
 */

// What a box the chrome draws covers, in the viewport host's own pixels; null for one not shown.
function coverOf(element, base) {
  if (!element || element.closest("[hidden]")) return null;
  const box = element.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) return null;
  return { left: box.left - base.left, top: box.top - base.top, right: box.right - base.left, bottom: box.bottom - base.top };
}

/**
 * The boxes the chrome over the view covers, in the viewport host's own pixels (`{ left, top, right, bottom }`
 * each), from the page as it is laid out now: the tool strip at the top centre and every panel of the stack
 * under it that is shown, then the file sidebar's tiles and its open section at the left. null where nothing
 * is shown (Preview puts the tools away), or outside a viewer.
 * @param {HTMLElement | null | undefined} host
 */
export function chromeCover(host) {
  const viewer = host?.closest?.("[data-cad-scene-backdrop]");
  if (!viewer) return null;
  const base = host.getBoundingClientRect();
  const groups = viewer.querySelector("[data-cad-tool-groups]");
  const boxes = [groups?.firstElementChild, ...(groups ? groups.querySelectorAll("[data-tool-panel]") : []),
    viewer.querySelector("[data-file-sidebar-tools]"), viewer.querySelector("aside[data-cad-file-sidebar][data-open]")]
    .map((element) => coverOf(element, base)).filter(Boolean);
  return boxes.length ? boxes : null;
}

/**
 * The box the colour bar covers at the view's foot, in the viewport host's own pixels; null with none shown.
 * @param {HTMLElement | null | undefined} host
 */
export function colourBarCover(host) {
  const viewer = host?.closest?.("[data-cad-scene-backdrop]");
  const bar = viewer?.querySelector?.('[aria-label$="colour bar"]');
  if (!bar || bar.closest("[hidden]")) return null;
  const box = bar.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) return null;
  const base = host.getBoundingClientRect();
  return { left: box.left - base.left, top: box.top - base.top, right: box.right - base.left, bottom: box.bottom - base.top };
}

// The gap a camera fit leaves between the model and the colour bar.
const BAR_GAP_PX = 8;

/**
 * How much of the view's width, from its left edge, the file sidebar's open section covers (Study, Parts, a
 * job's Job): what a camera fit leaves out at the left (`runtime.framingInset`). 0 with it closed: its tiles
 * cover only their corner, and the strip and the stack sit at the top centre.
 * @param {HTMLElement | null | undefined} host
 */
export function panelInset(host) {
  const viewer = host?.closest?.("[data-cad-scene-backdrop]");
  if (!viewer) return 0;
  return Math.max(coverOf(viewer.querySelector("aside[data-cad-file-sidebar][data-open]"), host.getBoundingClientRect())?.right ?? 0, 0);
}

/**
 * What a camera fit of a result leaves out of the view (`runtime.framingInset`), in pixels: at the left the shown
 * panels (`panelInset`), at the foot the colour bar and a gap over it, so no arrow or part is drawn under either.
 * @param {HTMLElement | null | undefined} host
 * @returns {{ left: number, bottom: number }}
 */
export function framingInset(host) {
  const bar = colourBarCover(host);
  const height = host?.getBoundingClientRect?.().height || 0;
  return { left: panelInset(host), bottom: bar && height > 0 ? Math.max(height - bar.top + BAR_GAP_PX, 0) : 0 };
}

/**
 * On screen, a label at the outer end of its own arrow: `gap` pixels on from its free end (`free`) along
 * the line from where it acts (`face`), the text running on the same way: to the right of an arrow that
 * leans right, to the left of one leaning left, centred over (or under) one that stands up. `{ x, y, align }`,
 * the text's middle at `y`.
 * @param {[number, number]} free
 * @param {[number, number] | null} face
 * @param {number} gap
 * @param {number} [lineHeight] the text's height, so a centred label clears the arrow's end
 */
export function besideEnd(free, face, gap, lineHeight = 14) {
  let dx = face ? free[0] - face[0] : 0;
  let dy = face ? free[1] - face[1] : 0;
  const span = Math.hypot(dx, dy);
  // Seen end on (pointing at the eye) or with nothing to run from: beside it, to the right.
  if (!(span >= 2)) return { x: free[0] + gap, y: free[1], align: "left" };
  dx /= span;
  dy /= span;
  if (Math.abs(dx) >= 0.5) return { x: free[0] + dx * gap, y: free[1] + dy * gap, align: dx < 0 ? "right" : "left" };
  return { x: free[0] + dx * gap, y: free[1] + dy * gap + Math.sign(dy) * lineHeight / 2, align: "center" };
}

/** A label's box on screen, from where it is drawn (`x`, its text's middle at `y`), how it is aligned and its `width`. */
function boxOf({ x, y, align, width }, height) {
  const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  return { left, right: left + width, top: y - height / 2, bottom: y + height / 2 };
}

const overlaps = (a, b, gap) => a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;

// How many times a label is nudged off the others before it is left where it is.
const MOST_NUDGES = 12;

/** A label moved, if it must be, so its whole box is inside the view (`bounds`: its width and height) by `margin`. */
function clamped(label, height, bounds, margin) {
  if (!bounds) return label;
  const box = boxOf(label, height);
  const dx = box.left < margin ? margin - box.left : box.right > bounds.width - margin ? bounds.width - margin - box.right : 0;
  const dy = box.top < margin ? margin - box.top : box.bottom > bounds.height - margin ? bounds.height - margin - box.bottom : 0;
  return dx || dy ? { ...label, x: label.x + dx, y: label.y + dy } : label;
}

/**
 * Labels placed on screen (`{ x, y, align, width }` each, in the host's pixels), moved where they must
 * be: inside the view (`bounds`, its `width` and `height`: a label past an edge is drawn whole, against it);
 * off the chrome over the view (`covers`, boxes in the host's pixels, one or a list: the strip, the stack and
 * the sidebar, `chromeCover`, which a label under moves right of, reading on from there; the colour bar at the foot,
 * `colourBarCover`, which a label over moves above); then off each other, each in turn nudged up or down, away
 * from the one it would cover, until it is clear. Returns new labels in the same order, each with `x`, `y` and `align`.
 * @param {{ x: number, y: number, align: string, width: number }[]} labels
 * @param {{ left: number, top: number, right: number, bottom: number } | Array<object> | null} covers
 * @param {{ height?: number, gap?: number, bounds?: { width: number, height: number } | null }} [options]
 */
export function settleLabels(labels, covers, { height = 14, gap = 4, bounds = null } = {}) {
  const boxes = (Array.isArray(covers) ? covers : [covers]).filter(Boolean);
  const settled = [];
  for (const label of labels) {
    let placed = clamped({ ...label }, height, bounds, gap);
    for (const cover of boxes) {
      if (!overlaps(boxOf(placed, height), cover, 0)) continue;
      // The panels stand at the view's left: right of them. Anything lower (the colour bar): above it.
      placed = cover.left <= gap * 4 ? { ...placed, x: cover.right + gap, align: "left" } : { ...placed, y: cover.top - gap - height / 2 };
    }
    for (let nudge = 0; nudge < MOST_NUDGES; nudge += 1) {
      const box = boxOf(placed, height);
      const other = settled.find((each) => overlaps(box, boxOf(each, height), gap));
      if (!other) break;
      const below = placed.y >= other.y;
      placed = { ...placed, y: below ? other.y + height + gap : other.y - height - gap };
    }
    settled.push(clamped(placed, height, bounds, gap));
  }
  return settled;
}
