import { useEffect, useRef } from "react";
import { colorsFor, curvePoints, lightText, planeMapping, strokePath } from "./sketchDrawing.js";
import { sketchGeometry } from "./sketchMode.js";
import { CLICK_SLOP_PX, extrudeSpan, screenSketch, sideIndexes, sketchAt, tagPlace } from "./sketchPicking.js";

const TAG_FONT_PX = 11;
const TAG_HEIGHT_PX = 18;
// How strongly the picked profile and a preview's faces are shaded over the model.
const PICKED_FILL_ALPHA = 0.22;
const PREVIEW_FILL_ALPHA = 0.3;

/** The CAD colors the layer draws in, from the viewer's tokens, with stand-ins for a host without them. */
function cadColors(host) {
  const style = getComputedStyle(host);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    picked: read("--cad-picked", "#4f9dff"), solid: read("--cad-solid", "#f2b33d"), solidEdge: read("--cad-solid-edge", "#8a5a12"),
    cut: read("--cad-cut", "#e5484d"),
    tagText: lightText(style.color || "") ? "#0b1220" : "#ffffff",
  };
}

function fillLoops(context, loops, color, alpha) {
  if (!loops.length) return;
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  for (const loop of loops) {
    loop.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
    context.closePath();
  }
  // A loop inside another is a hole in the profile, as the extrude takes it.
  context.fill("evenodd");
  context.restore();
}

/** The sketch's name in a tag of the picked blue, beside what is drawn of it (`tagPlace`). */
function drawTag(context, drawn, name, cad, font) {
  context.save();
  context.font = `${TAG_FONT_PX}px ${font}`;
  const width = context.measureText(name).width + 10;
  const place = tagPlace(drawn, width, TAG_HEIGHT_PX);
  if (!place) { context.restore(); return; }
  const [left, top] = place;
  context.fillStyle = cad.picked;
  context.beginPath();
  if (typeof context.roundRect === "function") context.roundRect(left, top, width, TAG_HEIGHT_PX, 4);
  else context.rect(left, top, width, TAG_HEIGHT_PX);
  context.fill();
  context.fillStyle = cad.tagText;
  context.textBaseline = "middle";
  context.fillText(name, left + 5, top + TAG_HEIGHT_PX / 2 + 0.5);
  context.restore();
}

/**
 * What an extrude of the sketch would make, drawn over the model as SolidWorks previews one: the
 * sketch's outlines again at each end of its span along the plane's normal, shaded, and the side
 * edges between them, in amber for material added and red for a cut.
 */
function drawPreview(context, view, shape, through, cad, at) {
  const span = extrudeSpan(shape, through);
  const loops = view.state?.loops || [];
  if (!span || !loops.length) return;
  const ends = span.map(at);
  if (!ends.every(Boolean)) return;
  // Material added in amber with the darker edge the icons draw it with; a cut in red.
  const fill = shape.kind === "cut" ? cad.cut : cad.solid;
  context.save();
  context.strokeStyle = shape.kind === "cut" ? cad.cut : cad.solidEdge;
  context.lineWidth = 2;
  for (const loop of loops) {
    const [near, far] = ends.map(mapping => loop.map(mapping.toScreen));
    if (!near.every(Boolean) || !far.every(Boolean)) continue;
    for (const end of [near, far]) {
      fillLoops(context, [end], fill, PREVIEW_FILL_ALPHA);
      context.beginPath();
      end.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
      context.closePath();
      context.stroke();
    }
    context.beginPath();
    for (const index of sideIndexes(loop)) {
      context.moveTo(near[index][0], near[index][1]);
      context.lineTo(far[index][0], far[index][1]);
    }
    context.stroke();
  }
  context.restore();
}

/**
 * The part's sketches drawn on the model while none is being edited, as SolidWorks shows them: a
 * sketch nothing makes a solid of yet stays in view on its plane (blue where it can still move,
 * black where it is defined). The one selected (in the design tree, or picked here) is drawn as
 * picked, so the sketch a feature takes is never in doubt: its profile shaded in the selection
 * blue, its lines heavier and its name tagged beside it. A sketch under the pointer turns the
 * hover orange.
 *
 * With `onPick`, a click on a sketch's line picks it, and with `profiles` (a feature waiting for a
 * sketch) a click inside its outline too; with `onEdit`, a double-click on its line opens it. Such a press is the sketch's, not the model's: claimed
 * before the camera or the model's picking sees it, as the joint handles claim theirs. `preview`
 * draws what an extrude of the selected sketch would make (`{ kind, end, depth, reverse }`, its
 * depth and `through`, the part's extent, in millimetres).
 *
 * @param {{ viewport: { runtimeRef: object, hostRef: object, viewerReadyTick: number },
 *   sketches: { file: string, line: number, name: string, state: object | null }[], selected?: { file: string, line: number } | null,
 *   onPick?: ((view: object) => void) | null, onEdit?: ((view: object) => void) | null, profiles?: boolean,
 *   preview?: object | null, through?: number }} props
 */
export default function SketchesLayer({ viewport, sketches, selected = null, onPick = null, onEdit = null, profiles = false, preview = null,
  through = 0 }) {
  const canvasRef = useRef(null);
  const live = useRef(null);
  live.current = { sketches, selected, onPick, onEdit, profiles, preview, through };
  const version = useRef(0);
  version.current += 1;
  // The sketch under the pointer, and the sketches as last painted, in the view's pixels.
  const hover = useRef(-1);
  const drawnRef = useRef([]);

  useEffect(() => {
    const host = viewport.hostRef?.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    let frameId = 0;
    let painted = "";
    let colors = colorsFor(host);
    let cad = cadColors(host);
    const paint = () => {
      frameId = requestAnimationFrame(paint);
      const runtime = viewport.runtimeRef?.current;
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      const dpr = window.devicePixelRatio || 1;
      const { sketches: shown, selected: chosen, preview: shape, through: extent } = live.current;
      const mappings = shown.map(view => (view.state ? planeMapping(runtime, width, height, view.state.frame, view.state.unit || 1) : null));
      const key = `${mappings.map(mapping => mapping?.key || "").join("/")}|${version.current}|${dpr}|${hover.current}`;
      if (key === painted) return;
      painted = key;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        colors = colorsFor(host);
        cad = cadColors(host);
      }
      const context = canvas.getContext("2d");
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const drawn = shown.map((view, index) => (mappings[index] ? screenSketch(view.state, mappings[index].toScreen) : null));
      drawnRef.current = drawn;
      let tag = null;
      shown.forEach((view, index) => {
        const mapping = mappings[index];
        if (!mapping) return;
        const picked = Boolean(chosen && chosen.file === view.file && chosen.line === view.line);
        const hovered = !picked && hover.current === index;
        if (picked) {
          fillLoops(context, drawn[index].loops, cad.picked, PICKED_FILL_ALPHA);
          if (shape && shape.file === view.file && shape.line === view.line) {
            const frame = view.state.frame;
            const at = offset => planeMapping(runtime, width, height,
              { ...frame, origin: frame.origin.map((value, axis) => value + frame.z[axis] * offset) }, view.state.unit || 1);
            drawPreview(context, view, shape, extent, cad, at);
          }
          tag = { drawn: drawn[index], name: view.name || "Sketch" };
        }
        for (const curve of sketchGeometry(view.state).curves) {
          context.strokeStyle = picked ? cad.picked : hovered ? colors.hover : curve.defined ? colors.quiet : colors.under;
          context.lineWidth = picked ? 2.5 : hovered ? 2 : 1.25;
          context.setLineDash(curve.construction ? [9, 4, 2, 4] : []);
          strokePath(context, curvePoints(curve), mapping.toScreen);
        }
        context.setLineDash([]);
      });
      if (tag) drawTag(context, tag.drawn, tag.name, cad, colors.font);
    };
    frameId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frameId);
  }, [viewport.hostRef, viewport.runtimeRef, viewport.viewerReadyTick]);

  useEffect(() => {
    const host = viewport.hostRef?.current;
    if (!host) return undefined;
    let press = null;
    const at = event => {
      const rect = host.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const under = event => (live.current.onPick ? sketchAt(drawnRef.current, at(event), { profiles: live.current.profiles }) : -1);
    const down = event => {
      if (event.button !== 0 || event.pointerType === "touch") return;
      const index = under(event);
      if (index < 0) return;
      event.stopPropagation();
      press = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, index };
    };
    const up = event => {
      const started = press;
      press = null;
      if (!started || started.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - started.x, event.clientY - started.y) > CLICK_SLOP_PX) return;
      const view = live.current.sketches[started.index];
      if (view) live.current.onPick?.(view);
    };
    const move = event => {
      if (event.buttons !== 0 || event.pointerType === "touch") return;
      const index = under(event);
      // Over a sketch the pointer is the sketch's: the model under it is not hovered.
      if (index >= 0) event.stopPropagation();
      if (index === hover.current) return;
      hover.current = index;
      host.style.cursor = index >= 0 ? "pointer" : "";
    };
    const leave = () => { hover.current = -1; };
    // A double-click on a sketch's line opens it to edit, as in the design tree.
    const twice = event => {
      if (!live.current.onEdit) return;
      const index = sketchAt(drawnRef.current, at(event));
      const view = index >= 0 ? live.current.sketches[index] : null;
      if (!view) return;
      event.stopPropagation();
      event.preventDefault();
      live.current.onEdit(view);
    };
    host.addEventListener("dblclick", twice, true);
    host.addEventListener("pointerdown", down, true);
    host.addEventListener("pointerup", up, true);
    host.addEventListener("pointermove", move, true);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointerdown", down, true);
      host.removeEventListener("pointerup", up, true);
      host.removeEventListener("pointermove", move, true);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("dblclick", twice, true);
      if (hover.current >= 0) host.style.cursor = "";
    };
  }, [viewport.hostRef, viewport.viewerReadyTick]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true" data-cad-sketches="" />;
}
