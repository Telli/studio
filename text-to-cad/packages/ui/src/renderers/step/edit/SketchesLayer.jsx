import { useEffect, useRef } from "react";
import {
  cadColors,
  colorsFor,
  curvePoints,
  drawArrow,
  drawArrowHead,
  drawLabel,
  fillShapes,
  framePoint,
  lineNearestRay,
  loopsCentroid,
  modelMapping,
  modelRay,
  planeMapping,
  PREVIEW_FILL_ALPHA,
  screenDirection,
  strokePath
} from "./sketchDrawing.js";
import { draggedAngle, draggedDepth, withUnit } from "./editMode.js";
import { sketchGeometry } from "./sketchMode.js";
import {
  CLICK_SLOP_PX,
  extrudeSpan,
  handleAt,
  holeLoops,
  revolvedFrame,
  screenSketch,
  sideIndexes,
  sketchAt,
  tagPlace,
  taperedLoop,
  turnArrowStart
} from "./sketchPicking.js";

const TAG_FONT_PX = 11;
const TAG_HEIGHT_PX = 18;
// How strongly the picked profile is shaded over the model.
const PICKED_FILL_ALPHA = 0.22;

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

// The sides of a swept outline on the screen, between it and its copy: one face for each run of it.
function sideFaces(near, far) {
  return near.map((point, index) => {
    const next = (index + 1) % near.length;
    return { points: [point, near[next], far[next], far[index]] };
  });
}

/**
 * What an extrude of the sketch would make, drawn over the model as SolidWorks previews one: a
 * solid shaded once, in amber for material added and red for a cut, the sketch's outlines again at
 * each end of its span along the plane's normal and the side edges between them; and an arrow at
 * the end it goes to, pointing the way it goes (both ends at Mid Plane), tagged with its depth
 * (`shape.label`). One the view cannot sweep (an end the body or a pick says, a depth written as
 * a size's name, `shape.arrowOnly`) draws its arrow alone, from the sketch, the server's preview
 * of it drawn apart (`PreviewLayer.jsx`). `model` maps the part's millimetres to the view.
 */
function drawPreview(context, view, shape, through, cad, at, model, font) {
  const loops = view.state?.loops || [];
  const frame = view.state?.frame;
  const unit = view.state?.unit || 1;
  if (!loops.length || !frame) return [];
  const holes = holeLoops(loops);
  // Material added in amber with the darker edge the icons draw it with; a cut in red.
  const fill = shape.kind === "cut" ? cad.cut : cad.solid;
  const stroke = shape.kind === "cut" ? cad.cut : cad.solidEdge;
  const span = shape.arrowOnly ? [0, 0] : extrudeSpan(shape, through);
  if (!span) return [];
  if (!shape.arrowOnly) {
    const ends = span.map(at);
    if (!ends.every(Boolean)) return [];
    // A draft leans the sides in (out, negative) by its angle: each end's outline is moved in by
    // how far it is from the sketch's plane, in the sketch's own units.
    const lean = Math.tan(((shape.taper || 0) * Math.PI) / 180) / unit;
    const drawn = loops.map((loop, index) => {
      const [near, far] = ends.map((mapping, end) => taperedLoop(loop, Math.abs(span[end]) * lean, holes[index]).map(mapping.toScreen));
      return { loop, hole: holes[index], near, far };
    }).filter(({ near, far }) => near.every(Boolean) && far.every(Boolean));
    fillShapes(context, drawn.flatMap(({ hole, near, far }) => [{ points: near, hole }, { points: far, hole }, ...sideFaces(near, far)]),
      fill, PREVIEW_FILL_ALPHA);
    context.save();
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    for (const { loop, near, far } of drawn) {
      for (const end of [near, far]) {
        context.beginPath();
        end.forEach(([x, y], point) => (point ? context.lineTo(x, y) : context.moveTo(x, y)));
        context.closePath();
        context.stroke();
      }
      context.beginPath();
      for (const corner of sideIndexes(loop)) {
        context.moveTo(near[corner][0], near[corner][1]);
        context.lineTo(far[corner][0], far[corner][1]);
      }
      context.stroke();
    }
    context.restore();
  }
  // The arrow at the end it reaches, or at each end of a Mid Plane; from the sketch for one the
  // body or a pick ends. Each is a handle (`handleAt`): where it starts, on the line it moves along.
  const middle = loopsCentroid(loops, holes);
  if (!middle || !model) return [];
  const reach = Math.max(0.5, Math.abs(span[1] - span[0]) / 4, (through || 0) / 50);
  const arrows = shape.end === "mid" ? [[span[1], 1], [span[0], -1]] : [[shape.reverse ? span[0] : span[1], shape.reverse ? -1 : 1]];
  const handles = [];
  arrows.forEach(([offset, sign], index) => {
    const along = frame.z.map(value => value * sign);
    const way = screenDirection(model, framePoint(frame, unit, middle, offset), along, reach);
    if (!way) return;
    const place = drawArrow(context, way, stroke);
    if (index === 0) drawLabel(context, shape.label, place, stroke, font);
    handles.push({ from: place.from, tip: place.tip, facing: place.facing, anchor: framePoint(frame, unit, middle, 0), along,
      reached: offset * sign });
  });
  return handles;
}

// How far round a full turn's arrow runs, short of closing on itself so its head reads.
const FULL_TURN_ARROW_DEGREES = 330;

/**
 * What a revolve of the sketch would make, drawn as SolidWorks previews one: a solid shaded once,
 * the profile again at steps around its axis and its corners' paths between them, in amber for
 * material added and red for a cut; the axis, a centerline; and an arrow turning the way it turns,
 * just outside the profile, tagged with its angle (`shape.label`). `at(degrees)` is the profile's
 * plane mapping turned that far (`revolvedFrame`). Returns the arrow's head as a handle
 * (`handleAt`), with where it can turn to: its place on the screen at each whole degree (`reach`).
 */
function drawRevolvePreview(context, view, shape, cad, at, font) {
  const loops = view.state?.loops || [];
  const total = shape.revolve.angle;
  if (!loops.length || !total) return [];
  const fine = Math.max(4, Math.ceil(Math.abs(total) / 10));
  const mappings = Array.from({ length: fine + 1 }, (_, step) => at((total * step) / fine));
  if (!mappings.every(Boolean)) return [];
  const fill = shape.kind === "cut" ? cad.cut : cad.solid;
  const stroke = shape.kind === "cut" ? cad.cut : cad.solidEdge;
  const holes = holeLoops(loops);
  // The profile at every step, on the screen; a solid shaded once over what its sides sweep, and
  // its two ends when it does not go all the way round.
  const steps = loops.map(loop => mappings.map(mapping => loop.map(mapping.toScreen)));
  const usable = steps.map(rings => rings.every(ring => ring.every(Boolean)));
  fillShapes(context, steps.flatMap((rings, index) => (!usable[index] ? []
    : [...rings.slice(1).flatMap((ring, step) => sideFaces(rings[step], ring)),
      ...(Math.abs(total) < 360 ? [{ points: rings[0], hole: holes[index] }, { points: rings[fine], hole: holes[index] }] : [])])),
  fill, PREVIEW_FILL_ALPHA);
  context.save();
  context.strokeStyle = stroke;
  steps.forEach((rings, index) => {
    if (!usable[index]) return;
    // The profile every 30 degrees or so, and where the turn ends.
    const every = Math.max(1, Math.round(fine / Math.max(1, Math.ceil(Math.abs(total) / 30))));
    rings.forEach((outline, step) => {
      if (step === 0 || (step % every !== 0 && step !== fine)) return;
      context.lineWidth = step === fine ? 2 : 1;
      context.beginPath();
      outline.forEach(([x, y], point) => (point ? context.lineTo(x, y) : context.moveTo(x, y)));
      context.closePath();
      context.stroke();
    });
    // Each corner's path around the axis.
    context.lineWidth = 1.5;
    for (const corner of sideIndexes(loops[index])) {
      context.beginPath();
      rings.forEach((ring, step) => (step ? context.lineTo(ring[corner][0], ring[corner][1]) : context.moveTo(ring[corner][0], ring[corner][1])));
      context.stroke();
    }
  });
  // The axis it turns about, drawn as a centerline past the profile's ends.
  const { a, b } = shape.revolve;
  const past = [a.map((value, axis) => value - (b[axis] - a[axis]) * 0.25), b.map((value, axis) => value + (b[axis] - a[axis]) * 0.25)]
    .map(mappings[0].toScreen);
  if (past.every(Boolean)) {
    context.lineWidth = 1.25;
    context.setLineDash([9, 4, 2, 4]);
    context.beginPath();
    context.moveTo(past[0][0], past[0][1]);
    context.lineTo(past[1][0], past[1][1]);
    context.stroke();
    context.setLineDash([]);
  }
  // The way it turns: an arrow around the axis, just outside the profile, as far as it turns.
  const start = turnArrowStart(loops, a, b);
  const shown = Math.sign(total) * Math.min(Math.abs(total), FULL_TURN_ARROW_DEGREES);
  const arc = start ? Array.from({ length: fine + 1 }, (_, step) => at((shown * step) / fine)?.toScreen(start) || null) : [];
  const handles = [];
  if (arc.length > 1 && arc.every(Boolean)) {
    context.lineWidth = 2;
    context.beginPath();
    arc.forEach(([x, y], step) => (step ? context.lineTo(x, y) : context.moveTo(x, y)));
    context.stroke();
    const [before, tip] = arc.slice(-2);
    const place = drawArrowHead(context, tip, [tip[0] - before[0], tip[1] - before[1]], stroke);
    drawLabel(context, shape.label, place, stroke, font);
    const sign = Math.sign(total);
    handles.push({ from: before, tip, facing: 0, reach: () => Array.from({ length: 360 }, (_, step) => at(sign * (step + 1))?.toScreen(start) || null) });
  }
  context.restore();
  return handles;
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
 * draws what an extrude or a revolve of the selected sketch would make, with the way it goes
 * (`{ kind, end, depth, reverse, taper, label, units, arrowOnly }` or `{ kind, revolve, label }`,
 * its depth and `through`, the part's extent, in millimetres). An extrude's arrow is a handle, as
 * SolidWorks' is: dragged along its line it sets the depth (`preview.onDepth`, given it as the
 * panel takes it), the extrude drawn at the depth reached until the press ends; clicked, it turns
 * the extrude the other way (`preview.onReverse`). A revolve's arrow is one too: dragged round its
 * axis it sets the angle (`preview.onAngle`), clicked it turns the other way.
 *
 * @param {{ viewport: { runtimeRef: object, hostRef: object, viewerReadyTick: number },
 *   sketches: { file: string, line: number, name: string, state: object | null }[],
 *   selected?: { file: string, line: number } | { file: string, line: number }[] | null,
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
  // The extrude's arrows as last painted, taken as handles; and the depth one is dragged to.
  const handlesRef = useRef([]);
  const draggedRef = useRef(null);

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
      const { sketches: shown, selected: chosen, preview: given, through: extent } = live.current;
      // A handle being dragged: the extrude drawn at the depth it has reached, or the revolve turned
      // as far as its arrow has, tagged with it.
      const dragged = draggedRef.current;
      const shape = !dragged || !given ? given
        : given.revolve ? (dragged.degrees ? { ...given, revolve: { ...given.revolve, angle: Math.sign(given.revolve.angle || 1) * dragged.degrees },
          label: `${dragged.text}°` } : given)
          : dragged.mm ? { ...given, depth: dragged.mm, label: withUnit(dragged.text, given.units) } : given;
      const mappings = shown.map(view => (view.state ? planeMapping(runtime, width, height, view.state.frame, view.state.unit || 1) : null));
      const key = `${mappings.map(mapping => mapping?.key || "").join("/")}|${version.current}|${dpr}|${hover.current}|${dragged?.text || ""}`;
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
      handlesRef.current = [];
      let tag = null;
      shown.forEach((view, index) => {
        const mapping = mappings[index];
        if (!mapping) return;
        // The sketch selected, or each a sweep or a loft has picked.
        const picked = (Array.isArray(chosen) ? chosen : chosen ? [chosen] : []).some(each => each.file === view.file && each.line === view.line);
        const hovered = !picked && hover.current === index;
        if (picked) fillLoops(context, drawn[index].loops, cad.picked, PICKED_FILL_ALPHA);
        // What an extrude or a revolve of it would make: the sketch picked for a new one, or a
        // reopened feature's own.
        if (shape && shape.file === view.file && shape.line === view.line) {
          const frame = view.state.frame;
          const unit = view.state.unit || 1;
          if (shape.revolve) {
            const { a, b } = shape.revolve;
            handlesRef.current = drawRevolvePreview(context, view, shape, cad, degrees => {
              const turned = revolvedFrame(frame, unit, a, b, degrees);
              return turned ? planeMapping(runtime, width, height, turned, unit) : null;
            }, colors.font);
          } else {
            const at = offset => planeMapping(runtime, width, height,
              { ...frame, origin: frame.origin.map((value, axis) => value + frame.z[axis] * offset) }, unit);
            handlesRef.current = drawPreview(context, view, shape, extent, cad, at, modelMapping(runtime, width, height), colors.font);
          }
        }
        if (picked) tag = { drawn: drawn[index], name: view.name || "Sketch" };
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
    // The extrude's or the revolve's arrow under the pointer, when the panel takes what it does.
    const handleUnder = event => {
      const shape = live.current.preview;
      return shape?.onDepth || shape?.onAngle || shape?.onReverse ? handleAt(handlesRef.current, at(event)) : null;
    };
    // How far from the sketch's plane, along a handle's line, the pointer is: in the part's millimetres.
    const reachAt = (event, handle) => {
      const [x, y] = at(event);
      const ray = modelRay(viewport.runtimeRef?.current, host.clientWidth || 1, host.clientHeight || 1, x, y);
      return ray ? lineNearestRay(handle.anchor, handle.along, ray.origin, ray.direction) : null;
    };
    let drag = null;
    let overHandle = false;
    // The pointer off the arrow (or a drag of it over): the cursor and the hint it gave let go.
    const leaveHandle = (always = false) => {
      if (!overHandle && !always) return;
      overHandle = false;
      host.style.cursor = "";
      host.removeAttribute("title");
      hover.current = -2; // the sketch under the pointer, if any, is found again
    };
    const dragMove = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.stopPropagation();
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= CLICK_SLOP_PX) return;
      drag.moved = true;
      const shape = live.current.preview;
      // A revolve's arrow turns about its axis, to the degree nearest the pointer.
      if (drag.reach) {
        if (!shape?.onAngle) return;
        draggedRef.current = draggedAngle(drag.reach, at(event));
        version.current += 1;
        return;
      }
      if (!shape?.onDepth || drag.grab === null) return;
      const reached = reachAt(event, drag.handle);
      if (reached === null) return;
      draggedRef.current = draggedDepth(reached - drag.grab, shape.end, shape.units);
      version.current += 1;
    };
    const stopDrag = () => {
      drag = null;
      window.removeEventListener("pointermove", dragMove, true);
      window.removeEventListener("pointerup", dragEnd, true);
      window.removeEventListener("pointercancel", dragEnd, true);
    };
    function dragEnd(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.stopPropagation();
      const { moved } = drag;
      stopDrag();
      leaveHandle(true);
      const shape = live.current.preview;
      const reached = draggedRef.current;
      draggedRef.current = null;
      version.current += 1;
      if (event.type === "pointercancel") return;
      if (moved) {
        if (reached) (reached.degrees ? shape?.onAngle : shape?.onDepth)?.(reached.text);
      } else shape?.onReverse?.();
    }
    const down = event => {
      if (event.button !== 0 || event.pointerType === "touch") return;
      const handle = handleUnder(event);
      if (handle) {
        // The arrow's press: not the camera's, nor the model's to pick under it.
        event.stopPropagation();
        event.preventDefault();
        const start = handle.facing || handle.reach ? null : reachAt(event, handle);
        // Where on the arrow it was taken, so its end moves with the pointer rather than jumping to
        // it; a revolve's, each place its head can turn to, worked out once for the drag.
        drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, handle, moved: false,
          grab: start === null ? null : start - handle.reached, reach: handle.reach ? handle.reach() : null };
        window.addEventListener("pointermove", dragMove, true);
        window.addEventListener("pointerup", dragEnd, true);
        window.addEventListener("pointercancel", dragEnd, true);
        host.style.cursor = "grabbing";
        return;
      }
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
      if (event.buttons !== 0 || event.pointerType === "touch" || drag) return;
      const handle = handleUnder(event);
      if (handle) {
        // Over the arrow the pointer is the arrow's, and says what it does.
        event.stopPropagation();
        if (!overHandle) {
          overHandle = true;
          const shape = live.current.preview;
          const what = handle.reach ? "angle" : "depth";
          const drags = Boolean(handle.reach ? shape?.onAngle : shape?.onDepth) && !handle.facing;
          host.style.cursor = drags ? "grab" : "pointer";
          host.title = drags ? (shape.onReverse ? `Drag to change the ${what}. Click to reverse it.` : `Drag to change the ${what}.`)
            : "Click to reverse it.";
        }
        return;
      }
      leaveHandle();
      const index = under(event);
      // Over a sketch the pointer is the sketch's: the model under it is not hovered.
      if (index >= 0) event.stopPropagation();
      if (index === hover.current) return;
      hover.current = index;
      host.style.cursor = index >= 0 ? "pointer" : "";
    };
    const leave = () => { leaveHandle(); hover.current = -1; };
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
      // A drag the layer goes with ends unsaid; the extrude stays at its panel's depth.
      if (drag) stopDrag();
      draggedRef.current = null;
      leaveHandle();
      if (hover.current >= 0) host.style.cursor = "";
    };
  }, [viewport.hostRef, viewport.viewerReadyTick]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true" data-cad-sketches="" />;
}
