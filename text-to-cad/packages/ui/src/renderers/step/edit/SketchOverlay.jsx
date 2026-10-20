import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { transitionCameraToViewPreset } from "../../kit/camera/runtimeCamera.js";
import { requestSceneFrame } from "../../kit/viewport/sceneFrames.js";
import { arrowHead, circlePoints, colorsFor, curvePoints, drawGlyph, GLYPH_PX, overlaps, planeMapping, strokePath } from "./sketchDrawing.js";
import {
  chainOf,
  CORNER_TOOLS,
  dimensionFor,
  dimensionLayout,
  drawOp,
  extendPiece,
  formatValue,
  hitTest,
  inferLine,
  MODEL_TOOLS,
  MODIFY_TOOLS,
  newCurves,
  PATTERN_TOOLS,
  patternCopies,
  patternSettings,
  placedSide,
  polygonCorners,
  polygonSides,
  refAt,
  relationGlyphs,
  sketchGeometry,
  snap,
  splineThrough,
  tangentArc,
  tangentStart,
  threePointArc,
  TOOL_CLICKS,
  toolSize,
  trimPiece
} from "./sketchMode.js";

// How near, in pixels, a press must land to pick something, and to land on a point or a curve.
const HIT_PX = 7;
const SNAP_PX = 10;
// How far a dimension sits off what it measures, and how big its arrows are, in pixels.
const GAP_PX = 26;
const ARROW_PX = 7;
const DRAG_PX = 3;
const ORIGIN_PX = 34;
const LEVELS = 5;

const editableTarget = target => target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
// A click's place, to the precision the part's sizes are shown in: 0.01 mm, 0.001 in.
const rounded = (place, units) => {
  const factor = units === "in" ? 1000 : 100;
  return place.map(value => Math.round(value * factor) / factor);
};

/** SolidWorks' Modify box: a dimension's value, typed over; Enter keeps it, Escape leaves it. */
function ModifyBox({ box, onDone }) {
  const [draft, setDraft] = useState(box.value);
  const inputRef = useRef(null);
  useEffect(() => { requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); }); }, []);
  const commit = () => { const text = String(draft).trim(); onDone(text || null); };
  return <form className="pointer-events-auto absolute z-30 flex items-center gap-1 rounded-md border border-border bg-background py-0.5 pl-1.5 pr-0.5 shadow-md"
    style={{ left: box.x, top: box.y, transform: "translate(-50%, -50%)" }} role="dialog" aria-label="Modify"
    onSubmit={event => { event.preventDefault(); commit(); }}
    onPointerDown={event => event.stopPropagation()}>
    <input ref={inputRef} value={draft} aria-label="Value" inputMode="decimal" spellCheck={false}
      className="w-20 bg-transparent text-tiny tabular-nums text-foreground outline-none"
      onChange={event => setDraft(event.target.value)}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onDone(null); } }} />
    {box.unit ? <span className="text-micro text-muted-foreground">{box.unit}</span> : null}
    <button type="submit" aria-label="OK" className="flex size-5 items-center justify-center rounded text-foreground hover:bg-accent"><Check className="size-3" aria-hidden="true" /></button>
    <button type="button" aria-label="Cancel" className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent" onClick={() => onDone(null)}>
      <X className="size-3" aria-hidden="true" />
    </button>
  </form>;
}

/**
 * Sketch mode's layer over the viewport, as a CAD tool's sketcher draws a sketch: its curves on
 * their plane in SolidWorks' colors (blue while they can move, black once defined, red where
 * relations are too many), its dimensions with their values (on the side each was placed, stacked
 * so none covers another), the origin's red axes, and the stroke the tool in hand is drawing,
 * landing on points, midpoints and curves and drawn level or plumb when it is near
 * (`sketchMode.js`). A press with a drawing tool places its next point; with Smart Dimension it
 * picks, then places, then the Modify box takes the value; with no tool it selects (Ctrl or Shift
 * adds) and drags what can move. A press on nothing, or with a modifier, still turns the view.
 * Escape steps back, Delete deletes what is selected, and a dimension's value is changed by a
 * double-click on it. Sketch Fillet, Trim, Offset and Mirror Entities take clicks on what is
 * drawn: a corner or two lines to round, the piece of a curve to cut away (shown as the pointer
 * passes over it), a chain to offset (shown too), the entities to mirror and then the centerline.
 *
 * @param {{ viewport: { runtimeRef: object, hostRef: object, viewerReadyTick: number },
 *   edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, units: string }} props
 */
export default function SketchOverlay({ viewport, edit, units, modelEdgeAt = null }) {
  const canvasRef = useRef(null);
  const [box, setBox] = useState(null);
  const sketch = edit.sketch;
  // Where each dimension was placed (above or below, left or right), as the person put it.
  const placements = useRef(new Map());
  // What the layer's handlers read when they run: the latest of everything.
  const live = useRef(null);
  live.current = { sketch, tool: edit.sketchTool, selection: edit.sketchSelection, construction: edit.construction, units, edit, box,
    settings: edit.sketchSettings, modelEdgeAt };
  // Bumped whenever something not in the camera changed, so the next frame paints again.
  const version = useRef(0);
  version.current += 1;

  // Normal To: the view turned to look straight at the sketch's plane, its x to the right.
  const frame = sketch?.state?.frame;
  useEffect(() => {
    const runtime = viewport.runtimeRef?.current;
    if (!runtime?.THREE || !runtime.modelGroup || !frame) return;
    const { THREE, modelGroup } = runtime;
    modelGroup.updateMatrixWorld();
    const origin = new THREE.Vector3(...frame.origin).applyMatrix4(modelGroup.matrixWorld);
    const toward = axis => new THREE.Vector3(...frame.origin).add(new THREE.Vector3(...axis)).applyMatrix4(modelGroup.matrixWorld).sub(origin).normalize().toArray();
    if (transitionCameraToViewPreset(runtime, { direction: toward(frame.z), up: toward(frame.y) })) {
      runtime.userMovedCamera = true;
      requestSceneFrame(runtime, false);
    }
    // Once per sketch opened, and on each Normal To.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.normalTo, viewport.viewerReadyTick, sketch?.file, sketch?.line]);

  useEffect(() => {
    const host = viewport.hostRef?.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    let frameId = 0;
    let painted = "";
    let colors = colorsFor(host);
    // The stroke under way: its tool's clicks so far, and where the pointer is.
    let picks = [];
    let pickedTool = null;
    let pointer = null; // { screen: [x, y], local: [u, v] }
    let hover = null;
    let busy = false;
    let turning = 0; // an arc's sweep so far, signed: which way the person is drawing it
    let lastAngle = null;
    let pending = null; // Smart Dimension: { picks, dimension, refs, value, placing }
    let drag = null;
    // A drag's latest live solve (`solveLive`), and the sketch shown between letting go and the written move's answer.
    let solved = null;
    let settling = null;
    let solving = false;
    let again = false;
    let labels = []; // each dimension's value on screen: { id, x, y, w, h }
    let geometry = null;
    let mapping = null;
    let step = -1;
    // Bumped by Escape and by another tool: a line whose reply is still on its way does not chain.
    let epoch = 0;
    // The stroke under way belongs to the tool it was started with; another tool starts afresh.
    const syncTool = () => {
      const tool = live.current.tool;
      if (tool === pickedTool) return;
      pickedTool = tool;
      picks = [];
      pending = null;
      turning = 0;
      lastAngle = null;
      epoch += 1;
      report();
    };

    const size = () => ({ width: host.clientWidth || 1, height: host.clientHeight || 1 });
    const localPoint = event => {
      const rect = host.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const map = () => {
      const state = live.current.sketch?.state;
      const { width, height } = size();
      return state ? planeMapping(viewport.runtimeRef?.current, width, height, state.frame, state.unit || 1) : null;
    };
    // The panel's prompt follows the clicks a tool has had.
    const report = () => {
      const tool = live.current.tool;
      const count = tool === "dimension" ? (pending?.placing ? 2 : pending?.picks?.length || 0)
        : tool === "mirror" ? (live.current.selection.length ? 1 : 0) : picks.length;
      if (count !== step) { step = count; live.current.edit.setSketchStep(count); }
    };

    // ---- painting ------------------------------------------------------------------------------
    const paint = () => {
      frameId = requestAnimationFrame(paint);
      syncTool();
      const current = live.current;
      const state = current.sketch?.state;
      mapping = map();
      const { width, height } = size();
      const dpr = window.devicePixelRatio || 1;
      const key = mapping ? `${mapping.key}|${version.current}|${dpr}` : "";
      if (key === painted) return;
      painted = key;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        colors = colorsFor(host);
      }
      const context = canvas.getContext("2d");
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      labels = [];
      if (!mapping || !state) return;
      const { toScreen, perUnit } = mapping;
      const path = (points, closed = false) => strokePath(context, points, toScreen, closed);
      // A drag is drawn as the sketch solved it last, or moved as the pointer has it until that first solve answers.
      const shown = drag?.moved ? solved || draggedState(state, drag) : settling || state;
      geometry = sketchGeometry(shown);
      const selection = new Set(current.selection);
      const redundant = new Set(state.redundant || []);
      const overDefined = new Set((state.relations || []).concat(state.dimensions || []).filter(item => redundant.has(item.id)).flatMap(item => item.refs));
      // What the tool in hand would take: Offset's chain, Sketch Fillet's or Sketch Chamfer's first line.
      const taking = new Set(current.tool === "offset" && hover && geometry.curves.some(curve => curve.id === hover)
        ? (current.settings?.offsetChain === false ? [hover] : chainOf(shown, hover)) : CORNER_TOOLS.includes(current.tool) ? picks.map(pick => pick.id) : []);
      // A relation hovered or selected (by its glyph) lights what it holds.
      const related = new Set((state.relations || []).filter(item => selection.has(item.id) || hover === item.id).flatMap(item => item.refs));
      const lit = id => taking.has(id) || related.has(id) || (hover === id && current.tool !== "trim");
      const colorOf = (id, defined) => (selection.has(id) ? colors.selected : lit(id) ? colors.hover
        : overDefined.has(id) ? colors.over : defined ? colors.defined : colors.under);

      // The origin: its red axes, as SolidWorks draws a sketch's origin.
      const origin = toScreen([0, 0]);
      if (origin) {
        context.strokeStyle = colors.origin;
        context.fillStyle = colors.origin;
        context.lineWidth = 1.5;
        for (const axis of [[1, 0], [0, 1]]) {
          const tip = toScreen([(axis[0] * ORIGIN_PX) / perUnit, (axis[1] * ORIGIN_PX) / perUnit]);
          if (!tip) continue;
          context.beginPath(); context.moveTo(origin[0], origin[1]); context.lineTo(tip[0], tip[1]); context.stroke();
          arrowHead(context, tip, origin, 6);
        }
      }

      // The curves, then their points: each end and center, and each point of its own.
      for (const curve of geometry.curves) {
        context.strokeStyle = colorOf(curve.id, curve.defined);
        context.lineWidth = selection.has(curve.id) || lit(curve.id) ? 2.6 : 1.6;
        context.setLineDash(curve.construction ? [9, 4, 2, 4] : []);
        path(curvePoints(curve));
      }
      context.setLineDash([]);
      for (const point of geometry.points.values()) {
        if (point.id === "Origin") continue;
        const screen = toScreen([point.x, point.y]);
        if (!screen) continue;
        const marked = selection.has(point.id) || hover === point.id;
        context.fillStyle = colorOf(point.id, point.defined);
        context.beginPath();
        context.arc(screen[0], screen[1], marked ? 4 : 2.5, 0, 2 * Math.PI);
        context.fill();
      }

      // The relations, each a glyph beside what it holds, several on one entity side by side along it.
      // Their boxes go in with the dimensions' labels, so a press picks them and no value covers one.
      if (current.settings?.relations !== false) {
        const onEntity = new Map();
        const toward = (from, step) => {
          const a = toScreen(from);
          const b = toScreen([from[0] + (step[0] * 20) / perUnit, from[1] + (step[1] * 20) / perUnit]);
          if (!a || !b) return null;
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        };
        for (const glyph of relationGlyphs(shown)) {
          const anchor = toScreen(glyph.at);
          const away = toward(glyph.at, glyph.away);
          const along = toward(glyph.at, glyph.along);
          if (!anchor || !away || !along) continue;
          const index = onEntity.get(glyph.on) || 0;
          onEntity.set(glyph.on, index + 1);
          const reach = GLYPH_PX * 0.9 + 4;
          const step = index * (GLYPH_PX + 3);
          const x = anchor[0] + away[0] * reach + along[0] * step;
          const y = anchor[1] + away[1] * reach + along[1] * step;
          const color = selection.has(glyph.id) ? colors.selected : hover === glyph.id ? colors.hover
            : glyph.redundant ? colors.over : colors.relation;
          drawGlyph(context, glyph.kind, x, y, { fill: colors.label, stroke: color });
          labels.push({ id: glyph.id, glyph: true, x: x - GLYPH_PX / 2, y: y - GLYPH_PX / 2, w: GLYPH_PX, h: GLYPH_PX });
        }
      }

      // The dimensions, each with its value, each stepped out until its value covers no other's.
      context.font = `11px ${colors.font}`;
      context.textBaseline = "middle";
      context.textAlign = "center";
      const gap = GAP_PX / perUnit;
      const drawDimension = (dimension, color, value, side) => {
        let layout = null;
        let rect = null;
        const text = formatValue(value, current.units, dimension.kind);
        const w = context.measureText(text).width + 8;
        const h = 15;
        for (let level = 0; level < LEVELS; level += 1) {
          layout = dimensionLayout(shown, dimension, gap, { side, level });
          const anchor = layout && toScreen(layout.anchor);
          if (!anchor) return null;
          rect = { x: anchor[0] - w / 2, y: anchor[1] - h / 2, w, h };
          if (!labels.some(other => overlaps(other, rect))) break;
        }
        context.strokeStyle = color;
        context.fillStyle = color;
        context.lineWidth = 1;
        for (const [a, b] of layout.lines) path([a, b]);
        if (layout.dimension) {
          const [a, b] = layout.dimension.map(toScreen);
          path(layout.dimension);
          if (a && b && Math.hypot(b[0] - a[0], b[1] - a[1]) > ARROW_PX * 2.5) {
            arrowHead(context, b, a, ARROW_PX);
            if (!layout.single) arrowHead(context, a, b, ARROW_PX);
          }
        }
        if (layout.arc) {
          const { center, radius, from, sweep } = layout.arc;
          path(circlePoints(center, radius, from, sweep));
        }
        context.fillStyle = colors.label;
        context.fillRect(rect.x, rect.y, rect.w, rect.h);
        context.fillStyle = color;
        context.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
        return rect;
      };
      for (const dimension of state.dimensions || []) {
        const color = selection.has(dimension.id) ? colors.selected : hover === dimension.id ? colors.hover
          : redundant.has(dimension.id) ? colors.over : colors.defined;
        const rect = drawDimension(dimension, color, dimension.value, placements.current.get(dimension.id) || 0);
        if (rect) labels.push({ id: dimension.id, ...rect });
      }
      if (pending?.dimension) {
        const made = { id: "", kind: pending.dimension, refs: pending.refs };
        drawDimension(made, colors.hover, pending.value, pointer?.local ? placedSide(state, made, pointer.local) : 0);
      }

      // Trim: the piece the pointer is over, as it would be cut away; Extend: the line's run on.
      if ((current.tool === "trim" || current.tool === "extend") && hover && pointer?.local) {
        const piece = current.tool === "trim" ? trimPiece(shown, hover, pointer.local) : extendPiece(shown, hover, pointer.local);
        if (piece) {
          context.strokeStyle = colors.over;
          context.lineWidth = 3;
          context.setLineDash([6, 4]);
          path(piece.points);
          context.setLineDash([]);
        }
      }

      // A sketch pattern's copies, dashed where they would go, before it is made.
      if (PATTERN_TOOLS.includes(current.tool) && current.selection.length) {
        const pattern = patternSettings(current.tool, current.settings || {}, current.selection, shown, current.units);
        context.strokeStyle = colors.preview;
        context.lineWidth = 1.5;
        context.setLineDash([6, 4]);
        for (const copy of patternCopies(shown, pattern)) {
          if (copy.kind !== "point") { path(curvePoints(copy)); continue; }
          const screen = toScreen(copy.at);
          if (!screen) continue;
          context.beginPath();
          context.arc(screen[0], screen[1], 3, 0, 2 * Math.PI);
          context.stroke();
        }
        context.setLineDash([]);
      }

      // The stroke under way, and where it lands.
      const tool = current.tool;
      if (tool && tool !== "dimension" && !MODIFY_TOOLS.includes(tool) && !MODEL_TOOLS.includes(tool) && pointer?.local) {
        const landing = landAt(pointer.local);
        context.strokeStyle = colors.preview;
        context.lineWidth = 1.5;
        context.setLineDash(tool === "centerline" || current.construction ? [9, 4, 2, 4] : [6, 4]);
        const cursor = refAt(state, landing);
        const readout = previewStroke(tool, picks.map(ref => refAt(state, ref)), cursor, landing, path);
        context.setLineDash([]);
        const screen = toScreen(cursor);
        if (screen) {
          if (landing.point || landing.on) {
            context.strokeStyle = colors.hover;
            context.lineWidth = 1.5;
            context.beginPath();
            context.arc(screen[0], screen[1], landing.point ? 6 : 4, 0, 2 * Math.PI);
            context.stroke();
          }
          if (readout) {
            const text = readout.relation ? `${readout.text}  ${readout.relation === "horizontal" ? "H" : "V"}` : readout.text;
            context.textAlign = "left";
            context.fillStyle = colors.label;
            const w = context.measureText(text).width + 8;
            context.fillRect(screen[0] + 12, screen[1] + 10, w, 15);
            context.fillStyle = colors.preview;
            context.fillText(text, screen[0] + 16, screen[1] + 18);
            context.textAlign = "center";
          }
        }
      }
    };

    // Where a press lands for the stroke under way: on a point, a midpoint or a curve near it, or
    // a place to the part's precision.
    const landAt = place => {
      const state = live.current.sketch?.state;
      if (!state || !mapping) return { at: place };
      const exclude = picks.length && picks[picks.length - 1].point ? [picks[picks.length - 1].point] : [];
      const landed = snap(state, place, SNAP_PX / mapping.perUnit, { exclude });
      return landed.point || landed.on ? landed : { at: rounded(place, live.current.units) };
    };

    // The stroke drawn as it would be with the pointer here, and what to say beside the pointer.
    const previewStroke = (tool, placed, cursor, landing, path) => {
      const fmt = value => formatValue(value, live.current.units, "length");
      if (!placed.length) return null;
      const [first, second] = placed;
      if (tool === "spline") {
        path(splineThrough([...placed, cursor]));
        return null;
      }
      if (tool === "line" || tool === "centerline") {
        const inferred = landing.point || landing.on ? { end: cursor, relation: null } : inferLine(first, cursor);
        path([first, inferred.end]);
        return { text: fmt(Math.hypot(inferred.end[0] - first[0], inferred.end[1] - first[1])), relation: inferred.relation };
      }
      if (tool === "rectangle" || tool === "center_rectangle") {
        const [x0, y0, x1, y1] = tool === "rectangle" ? [first[0], first[1], cursor[0], cursor[1]]
          : [2 * first[0] - cursor[0], 2 * first[1] - cursor[1], cursor[0], cursor[1]];
        path([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
        return { text: `${fmt(Math.abs(x1 - x0))} x ${fmt(Math.abs(y1 - y0))}` };
      }
      if (tool === "circle") {
        const radius = Math.hypot(cursor[0] - first[0], cursor[1] - first[1]);
        path(circlePoints(first, radius));
        return { text: `R${fmt(radius)}` };
      }
      if (tool === "arc") {
        const radius = Math.hypot((second || cursor)[0] - first[0], (second || cursor)[1] - first[1]);
        if (!second) { path([first, cursor]); return { text: `R${fmt(radius)}` }; }
        const from = Math.atan2(second[1] - first[1], second[0] - first[0]);
        let sweep = Math.atan2(cursor[1] - first[1], cursor[0] - first[0]) - from;
        if (turning < 0 && sweep > 0) sweep -= 2 * Math.PI;
        if (turning >= 0 && sweep < 0) sweep += 2 * Math.PI;
        path(circlePoints(first, radius, from, sweep));
        return { text: `R${fmt(radius)}` };
      }
      if (tool === "three_point_arc") {
        if (!second) { path([first, cursor]); return { text: fmt(Math.hypot(cursor[0] - first[0], cursor[1] - first[1])) }; }
        const arc = threePointArc(first, cursor, second);
        if (!arc) { path([first, second]); return null; }
        path(circlePoints(arc.center, arc.radius, arc.from, arc.sweep));
        return { text: `R${fmt(arc.radius)}` };
      }
      if (tool === "tangent_arc") {
        // From the curve's end, leaving the way the curve was going.
        const arc = tangentArc(live.current.sketch?.state, picks[0], cursor);
        if (!arc) { path([first, cursor]); return null; }
        const angle = place => Math.atan2(place[1] - arc.center[1], place[0] - arc.center[0]);
        const turn = ((angle(cursor) - angle(first)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        path(circlePoints(arc.center, arc.radius, angle(first), arc.clockwise ? turn - 2 * Math.PI : turn));
        return { text: `R${fmt(arc.radius)}` };
      }
      if (tool === "polygon") {
        const sides = polygonSides(live.current.settings?.polygonSides);
        path(polygonCorners(first, cursor, sides), true);
        return { text: `${sides} sides, R${fmt(Math.hypot(cursor[0] - first[0], cursor[1] - first[1]))}` };
      }
      if (tool === "slot") {
        if (!second) { path([first, cursor]); return { text: fmt(Math.hypot(cursor[0] - first[0], cursor[1] - first[1])) }; }
        const along = [second[0] - first[0], second[1] - first[1]];
        const length = Math.hypot(along[0], along[1]) || 1;
        const n = [-along[1] / length, along[0] / length];
        const radius = Math.abs((cursor[0] - first[0]) * n[0] + (cursor[1] - first[1]) * n[1]);
        const angle = Math.atan2(along[1], along[0]);
        path([...circlePoints(second, radius, angle - Math.PI / 2, Math.PI), ...circlePoints(first, radius, angle + Math.PI / 2, Math.PI)], true);
        return { text: `${fmt(radius * 2)} wide` };
      }
      return null;
    };

    // ---- the person's presses --------------------------------------------------------------------
    const send = async op => {
      busy = true;
      try {
        return await live.current.edit.sketchOp(op);
      } finally {
        busy = false;
        version.current += 1;
      }
    };

    // A spline drawn through the points clicked, ended by a double-click or Enter, or closed.
    const finishSpline = async (closed = false) => {
      const op = drawOp("spline", picks, live.current.sketch.state, { construction: live.current.construction, closed });
      picks = [];
      report();
      if (op) await send(op);
    };

    const finishStroke = async (tool, ref) => {
      const state = live.current.sketch.state;
      // A Tangent Arc starts at the end of a line or an arc, or nowhere.
      if (tool === "tangent_arc" && !picks.length && !tangentStart(state, ref)) return;
      // A spline takes each point clicked; its first clicked again closes it, as SolidWorks' does.
      if (tool === "spline") {
        const first = picks[0] ? refAt(state, picks[0]) : null;
        const here = refAt(state, ref);
        const near = first && Math.hypot(here[0] - first[0], here[1] - first[1]) <= SNAP_PX / (mapping?.perUnit || 1);
        if (picks.length >= 3 && near) return finishSpline(true);
        picks = [...picks, ref];
        report();
        return;
      }
      picks = [...picks, ref];
      report();
      if (picks.length < TOOL_CLICKS[tool]) return;
      const op = drawOp(tool, picks, state, { construction: live.current.construction, clockwise: turning < 0,
        sides: live.current.settings?.polygonSides });
      const chain = tool === "line" || tool === "centerline";
      picks = [];
      turning = 0;
      lastAngle = null;
      report();
      if (!op) return;
      const started = epoch;
      const reply = await send(op);
      // A line goes on from where it ended, as a CAD tool's Line chains, unless Escape came first.
      if (chain && reply?.ok && live.current.tool === tool && started === epoch) {
        const lines = (reply.sketch?.state?.curves || []).filter(curve => curve.kind === "line");
        const last = lines[lines.length - 1];
        if (last) picks = [{ point: last.end, at: refAt(reply.sketch.state, { point: last.end }) }];
        report();
      }
    };

    const pickForDimension = (id, place, state = live.current.sketch.state) => {
      if (!pending) pending = { picks: [] };
      if (id && !pending.picks.includes(id) && pending.picks.length < 2) pending.picks = [...pending.picks, id];
      const made = dimensionFor(state, pending.picks, place);
      const placeable = made && (pending.picks.length === 2 || !geometry?.points.has(pending.picks[0]));
      pending = placeable ? { ...pending, ...made, placing: true } : { picks: pending.picks };
      report();
    };

    // A model edge pressed with Smart Dimension: brought in dashed, as Convert Entities' For construction
    // brings it, and dimensioned to through the curve it made, as SolidWorks dimensions to model edges.
    const referenceEdge = async (edge, place) => {
      const before = live.current.sketch?.state;
      const reply = await send({ kind: "convert", items: [edge], construction: true });
      const state = reply?.ok ? reply.sketch?.state : null;
      const [made] = newCurves(before, state);
      if (made && live.current.tool === "dimension") pickForDimension(made, place, state);
    };

    // The Modify box, at a place on screen, its value set; `onCommit` gets what was typed.
    const openModify = (screen, value, onCommit, kind) => {
      const unitText = kind === "angle" ? "deg" : live.current.units === "in" ? "in" : live.current.units === "mm" ? "mm" : "";
      setBox({ x: screen[0], y: screen[1], value, unit: unitText, onCommit });
    };

    const placeDimension = (made, screen) => {
      const state = live.current.sketch.state;
      const side = pointer?.local ? placedSide(state, { kind: made.dimension, refs: made.refs }, pointer.local) : 0;
      const before = new Set((state.dimensions || []).map(dimension => dimension.id));
      openModify(screen, formatValue(made.value, live.current.units, "plain"), async text => {
        if (!text) return;
        const reply = await send({ kind: "dimension", dimension: made.dimension, refs: made.refs, value: text });
        const added = (reply?.sketch?.state?.dimensions || []).find(dimension => !before.has(dimension.id));
        if (added && side) placements.current.set(added.id, side);
      }, made.dimension);
    };

    // A dimension's value under a place on screen, or, with no tool in hand, a relation's glyph.
    const labelAt = screen => labels.find(rect => (!rect.glyph || !live.current.tool)
      && screen[0] >= rect.x && screen[0] <= rect.x + rect.w && screen[1] >= rect.y && screen[1] <= rect.y + rect.h);

    // A click with a tool that changes what is drawn, on what it hit.
    const useTool = async (tool, hit, place) => {
      const current = live.current;
      const state = current.sketch.state;
      const { points, curves } = sketchGeometry(state);
      const curve = curves.find(each => each.id === hit);
      const units = current.units;
      if (CORNER_TOOLS.includes(tool)) {
        // Sketch Fillet's radius, or Sketch Chamfer's distance, on a corner or two lines that meet.
        const size = tool === "fillet" ? { radius: toolSize(current.settings?.filletRadius, units, "fillet") }
          : { distance: toolSize(current.settings?.chamferDistance, units, "chamfer") };
        if (hit && points.has(hit)) { picks = []; report(); await send({ kind: tool, corner: hit, ...size }); return; }
        if (curve?.kind !== "line" || curve.derived) return;
        if (!picks.length) { picks = [{ id: hit }]; report(); return; }
        const first = picks[0].id;
        picks = [];
        report();
        if (first !== hit) await send({ kind: tool, lines: [first, hit], ...size });
        return;
      }
      if (tool === "trim") {
        if (curve && !curve.derived) await send({ kind: "trim", curve: hit, at: rounded(place, units) });
        return;
      }
      if (tool === "extend") {
        if ((curve?.kind === "line" || curve?.kind === "arc") && !curve.derived) await send({ kind: "extend", curve: hit, at: rounded(place, units) });
        return;
      }
      if (tool === "offset") {
        if (!curve || curve.derived) return;
        const items = current.settings?.offsetChain === false ? [hit] : chainOf(state, hit);
        await send({ kind: "offset", items, distance: toolSize(current.settings?.offsetDistance, units, "offset"),
          reverse: Boolean(current.settings?.offsetReverse), construction: Boolean(current.settings?.offsetConstruction),
          ...(current.settings?.offsetBase ? { base: true } : {}) });
        return;
      }
      if (PATTERN_TOOLS.includes(tool)) {
        // What the pattern copies, clicked in and out; a circular one's center, a point clicked last.
        if (!hit || curve?.derived) return;
        current.edit.selectInSketch(current.selection.includes(hit) ? current.selection.filter(id => id !== hit) : [...current.selection, hit]);
        return;
      }
      if (tool === "mirror") {
        const selection = current.selection.filter(id => id !== hit);
        // A centerline, once something is picked, is what they are mirrored about.
        if (curve?.kind === "line" && curve.construction && selection.length) {
          const reply = await send({ kind: "mirror", items: selection, about: hit });
          if (reply?.ok) current.edit.selectInSketch([]);
          return;
        }
        if (!hit || curve?.derived) return;
        current.edit.selectInSketch(current.selection.includes(hit) ? selection : [...current.selection, hit]);
      }
    };

    const handlePointerDown = event => {
      const current = live.current;
      if (!current.sketch?.state || current.box) return;
      if (event.button !== 0 || event.altKey) return;
      const screen = localPoint(event);
      const place = mapping?.toLocal(screen);
      if (!place) return;
      pointer = { screen, local: place };
      const tool = current.tool;
      // Convert Entities picks on the model: the press is the model's, as the viewer picks there.
      if (MODEL_TOOLS.includes(tool)) return;
      const extend = event.ctrlKey || event.metaKey || event.shiftKey;
      if (tool && MODIFY_TOOLS.includes(tool)) {
        if (extend) return; // a modifier keeps the press for the camera
        event.preventDefault();
        event.stopPropagation();
        if (busy) return;
        syncTool();
        void useTool(tool, hitTest(current.sketch.state, place, HIT_PX / (mapping?.perUnit || 1)), place);
        version.current += 1;
        return;
      }
      if (tool && tool !== "dimension") {
        if (extend) return; // a modifier keeps the press for the camera
        event.preventDefault();
        event.stopPropagation();
        if (busy) return;
        syncTool();
        void finishStroke(tool, landAt(place));
        return;
      }
      const label = labelAt(screen);
      const hit = label?.id || hitTest(current.sketch.state, place, HIT_PX / (mapping?.perUnit || 1));
      if (tool === "dimension") {
        event.preventDefault();
        event.stopPropagation();
        // Nothing of the sketch here: an edge of the model, if one is, to dimension to.
        const edge = !hit && !label && (pending?.picks?.length || 0) < 2 ? current.modelEdgeAt?.(event.clientX, event.clientY) : null;
        if (edge) {
          if (!busy) void referenceEdge(edge, place);
          version.current += 1;
          return;
        }
        if (pending?.placing && (!hit || pending.picks.length === 2 || label)) {
          const made = pending;
          pending = null;
          report();
          placeDimension(made, screen);
          version.current += 1;
          return;
        }
        if (hit && !label) pickForDimension(hit, place);
        version.current += 1;
        return;
      }
      // No tool: select, and drag what can move.
      if (!hit) {
        if (current.selection.length && !extend) current.edit.selectInSketch([]);
        return; // the camera's
      }
      event.preventDefault();
      event.stopPropagation();
      const selection = current.selection;
      const next = extend ? (selection.includes(hit) ? selection.filter(id => id !== hit) : [...selection, hit])
        : selection.includes(hit) ? selection : [hit];
      current.edit.selectInSketch(next);
      if (!label && !extend) {
        const controls = viewport.runtimeRef?.current?.controls;
        drag = { id: hit, from: place, to: place, screen, moved: false, pointerId: event.pointerId, controls, controlsWereEnabled: controls?.enabled !== false,
          ...radiusGrip(current.sketch.state, hit) };
        solved = null;
        if (controls) controls.enabled = false;
        try { host.setPointerCapture(event.pointerId); } catch { /* a pointer already gone */ }
      }
    };

    const handlePointerMove = event => {
      const screen = localPoint(event);
      const place = mapping?.toLocal(screen) || null;
      pointer = place ? { screen, local: place } : null;
      const current = live.current;
      if (drag && event.pointerId === drag.pointerId && place) {
        event.preventDefault();
        event.stopPropagation();
        drag.to = place;
        if (Math.hypot(screen[0] - drag.screen[0], screen[1] - drag.screen[1]) > DRAG_PX) drag.moved = true;
        if (drag.moved) void solveLive();
        version.current += 1;
        return;
      }
      if (event.buttons !== 0) return; // the camera turning
      if (MODEL_TOOLS.includes(current.tool)) {
        // The model's own hover shows what Convert Entities would take.
        if (hover !== null) { hover = null; version.current += 1; }
        host.style.cursor = "";
        return;
      }
      if (current.tool === "arc" && picks.length === 2 && place) {
        const center = refAt(current.sketch.state, picks[0]);
        const angle = Math.atan2(place[1] - center[1], place[0] - center[0]);
        if (lastAngle !== null) {
          let delta = angle - lastAngle;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          turning += delta;
        }
        lastAngle = angle;
      }
      if (current.tool === "dimension" && pending?.placing && place) {
        const made = dimensionFor(current.sketch.state, pending.picks, place);
        if (made) pending = { ...pending, ...made };
      }
      const label = labelAt(screen);
      const picking = !current.tool || current.tool === "dimension" || MODIFY_TOOLS.includes(current.tool);
      const over = picking
        ? (MODIFY_TOOLS.includes(current.tool) ? null : label?.id) || (place && current.sketch?.state ? hitTest(current.sketch.state, place, HIT_PX / (mapping?.perUnit || 1)) : null) : null;
      if (over !== hover) hover = over;
      if (current.tool === "mirror") report();
      host.style.cursor = current.tool && !picking ? "crosshair" : over ? "pointer" : "";
      version.current += 1;
    };

    const handlePointerUp = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.stopPropagation();
      const done = drag;
      drag = null;
      if (done.controls) done.controls.enabled = done.controlsWereEnabled;
      try { host.releasePointerCapture(done.pointerId); } catch { /* released already */ }
      version.current += 1;
      if (!done.moved) { solved = null; return; }
      const op = dragOp(live.current.sketch.state, done, live.current.units);
      if (!op) { solved = null; return; }
      // The sketch stays where the drag left it until the written move's solve replaces it.
      settling = solved || draggedState(live.current.sketch.state, done);
      solved = null;
      void send(op).finally(() => { settling = null; version.current += 1; });
    };

    // A drag solved as it goes, the way a CAD tool's sketcher follows the pointer: one solve asked
    // at a time, the newest place asked again once it answers, nothing written until the drag ends.
    const solveLive = async () => {
      if (solving) { again = true; return; }
      const current = drag;
      const op = current ? dragOp(live.current.sketch.state, current, live.current.units) : null;
      if (!op) return;
      solving = true;
      try {
        const state = await live.current.edit.sketchDrag(op);
        if (state && drag === current) { solved = state; version.current += 1; }
      } finally {
        solving = false;
      }
      if (again && drag) { again = false; void solveLive(); }
    };

    const handleDoubleClick = event => {
      const current = live.current;
      // A double-click ends a spline at its place: its second press placed it twice, so once is taken off.
      if (current.tool === "spline" && picks.length >= 2) {
        event.preventDefault();
        event.stopPropagation();
        const state = current.sketch?.state;
        const [a, b] = picks.slice(-2).map(ref => refAt(state, ref));
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= SNAP_PX / (mapping?.perUnit || 1)) picks = picks.slice(0, -1);
        void finishSpline();
        return;
      }
      if (!current.sketch?.state || current.tool) return;
      const screen = localPoint(event);
      const label = labelAt(screen);
      if (!label) return;
      event.preventDefault();
      event.stopPropagation();
      const dimension = (current.sketch.state.dimensions || []).find(each => each.id === label.id);
      if (!dimension) return;
      const shown = dimension.named ? dimension.formula : formatValue(dimension.value, current.units, "plain");
      openModify([label.x + label.w / 2, label.y + label.h / 2], shown, text => {
        if (text && text !== shown) void send({ kind: "value", dimension: dimension.id, text });
      }, dimension.kind);
    };

    const handleKeyDown = event => {
      const current = live.current;
      if (!current.sketch || editableTarget(event.target) || current.box) return;
      if (event.key === "Escape") {
        epoch += 1;
        if (picks.length || pending) { picks = []; pending = null; turning = 0; lastAngle = null; report(); }
        else if (current.tool) current.edit.setSketchTool(null);
        else if (current.selection.length) current.edit.selectInSketch([]);
        else return;
        event.preventDefault();
        version.current += 1;
      } else if (event.key === "Enter" && current.tool === "spline" && picks.length >= 2 && !busy) {
        event.preventDefault();
        void finishSpline();
      } else if ((event.key === "Delete" || event.key === "Backspace") && current.selection.length && !busy) {
        event.preventDefault();
        void send({ kind: "delete", items: current.selection });
      }
    };
    const handleLeave = () => { pointer = null; hover = null; version.current += 1; };

    host.addEventListener("pointerdown", handlePointerDown, true);
    host.addEventListener("pointermove", handlePointerMove, true);
    host.addEventListener("pointerup", handlePointerUp, true);
    host.addEventListener("pointercancel", handlePointerUp, true);
    host.addEventListener("dblclick", handleDoubleClick, true);
    host.addEventListener("pointerleave", handleLeave);
    window.addEventListener("keydown", handleKeyDown);
    frameId = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frameId);
      if (drag?.controls) drag.controls.enabled = drag.controlsWereEnabled;
      host.removeEventListener("pointerdown", handlePointerDown, true);
      host.removeEventListener("pointermove", handlePointerMove, true);
      host.removeEventListener("pointerup", handlePointerUp, true);
      host.removeEventListener("pointercancel", handlePointerUp, true);
      host.removeEventListener("dblclick", handleDoubleClick, true);
      host.removeEventListener("pointerleave", handleLeave);
      window.removeEventListener("keydown", handleKeyDown);
      host.style.cursor = "";
    };
  }, [viewport.hostRef, viewport.runtimeRef, viewport.viewerReadyTick]);

  return <>
    <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true" data-cad-sketch="" />
    {box ? <ModifyBox key={`${box.x}:${box.y}`} box={box} onDone={text => { const done = box; setBox(null); if (text) done.onCommit(text); }} /> : null}
  </>;
}

// The points a drag moves: a point itself; a line's two ends together; a spline's points; a circle's or an arc's center.
function dragPoints(state, id) {
  const curve = (state.curves || []).find(each => each.id === id);
  if (!curve) return [id];
  if (curve.kind === "line") return [curve.start, curve.end];
  if (curve.kind === "spline") return curve.points || [];
  return [curve.center];
}

/**
 * A circle pressed on its edge is sized by the drag, as a CAD tool's sketcher does, when its radius
 * is a number the sketch may write; pressed anywhere else, or with its size set, it moves.
 */
function radiusGrip(state, id) {
  const curve = (state?.curves || []).find(each => each.id === id);
  if (curve?.kind !== "circle" || !curve.literal || curve.derived) return {};
  const center = (state.points || []).find(point => point.id === curve.center);
  return center ? { radius: { curve: id, center: [center.x, center.y] } } : {};
}

/** A radius drag's new radius: how far the pointer is from the circle's center. */
const dragRadius = drag => Math.hypot(drag.to[0] - drag.radius.center[0], drag.to[1] - drag.radius.center[1]);

/** The sketch drawn with a drag's points where the pointer has them, or its circle at the pointer's radius. */
function draggedState(state, drag) {
  if (drag.radius) {
    const radius = dragRadius(drag);
    return { ...state, curves: (state.curves || []).map(curve => (curve.id === drag.radius.curve ? { ...curve, radius } : curve)) };
  }
  const delta = [drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]];
  const moving = new Set(dragPoints(state, drag.id).filter(id => {
    const point = state.points.find(each => each.id === id);
    return point && !point.defined;
  }));
  const points = state.points.map(point => (moving.has(point.id) ? { ...point, x: point.x + delta[0], y: point.y + delta[1] } : point));
  // A spline whose points move is drawn through them where they are, until the sketch solves it.
  const place = new Map(points.map(point => [point.id, [point.x, point.y]]));
  const curves = (state.curves || []).map(curve => (curve.kind === "spline" && (curve.points || []).some(id => moving.has(id))
    ? { ...curve, samples: splineThrough(curve.points.map(id => place.get(id)).filter(Boolean), Boolean(curve.closed)) } : curve));
  return { ...state, points, curves };
}

/** What a drag sends: the points it moved, to where the pointer left them, or its circle's radius, to the part's precision. */
function dragOp(state, drag, units) {
  if (drag.radius) {
    const [radius] = rounded([dragRadius(drag)], units);
    return radius > 0 ? { kind: "move", curves: [{ curve: drag.radius.curve, radius }] } : null;
  }
  const delta = [drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]];
  const points = dragPoints(state, drag.id)
    .map(id => state.points.find(point => point.id === id))
    .filter(point => point && !point.defined && point.id !== "Origin")
    .map(point => ({ point: point.id, to: rounded([point.x + delta[0], point.y + delta[1]], units) }));
  return points.length ? { kind: "move", points } : null;
}
