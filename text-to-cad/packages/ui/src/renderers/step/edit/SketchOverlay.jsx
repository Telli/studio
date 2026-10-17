import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { transitionCameraToViewPreset } from "../../kit/camera/runtimeCamera.js";
import { requestSceneFrame } from "../../kit/viewport/sceneFrames.js";
import { arrowHead, circlePoints, colorsFor, curvePoints, overlaps, planeMapping, strokePath } from "./sketchDrawing.js";
import {
  dimensionFor,
  dimensionLayout,
  drawOp,
  formatValue,
  hitTest,
  inferLine,
  placedSide,
  refAt,
  sketchGeometry,
  snap,
  TOOL_CLICKS
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
 * double-click on it.
 *
 * @param {{ viewport: { runtimeRef: object, hostRef: object, viewerReadyTick: number },
 *   edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, units: string }} props
 */
export default function SketchOverlay({ viewport, edit, units }) {
  const canvasRef = useRef(null);
  const [box, setBox] = useState(null);
  const sketch = edit.sketch;
  // Where each dimension was placed (above or below, left or right), as the person put it.
  const placements = useRef(new Map());
  // What the layer's handlers read when they run: the latest of everything.
  const live = useRef(null);
  live.current = { sketch, tool: edit.sketchTool, selection: edit.sketchSelection, construction: edit.construction, units, edit, box };
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
      const count = live.current.tool === "dimension" ? (pending?.placing ? 2 : pending?.picks?.length || 0) : picks.length;
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
      // A point being dragged is drawn where the pointer has it.
      const shown = drag?.moved ? draggedState(state, drag) : state;
      geometry = sketchGeometry(shown);
      const selection = new Set(current.selection);
      const redundant = new Set(state.redundant || []);
      const overDefined = new Set((state.relations || []).concat(state.dimensions || []).filter(item => redundant.has(item.id)).flatMap(item => item.refs));
      const colorOf = (id, defined) => (selection.has(id) ? colors.selected : hover === id ? colors.hover
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
        context.lineWidth = selection.has(curve.id) || hover === curve.id ? 2.6 : 1.6;
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

      // The stroke under way, and where it lands.
      const tool = current.tool;
      if (tool && tool !== "dimension" && pointer?.local) {
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

    const finishStroke = async (tool, ref) => {
      const state = live.current.sketch.state;
      picks = [...picks, ref];
      report();
      if (picks.length < TOOL_CLICKS[tool]) return;
      const op = drawOp(tool, picks, state, { construction: live.current.construction, clockwise: turning < 0 });
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

    const pickForDimension = (id, place) => {
      const state = live.current.sketch.state;
      if (!pending) pending = { picks: [] };
      if (id && !pending.picks.includes(id) && pending.picks.length < 2) pending.picks = [...pending.picks, id];
      const made = dimensionFor(state, pending.picks, place);
      const placeable = made && (pending.picks.length === 2 || !geometry?.points.has(pending.picks[0]));
      pending = placeable ? { ...pending, ...made, placing: true } : { picks: pending.picks };
      report();
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

    const labelAt = screen => labels.find(rect => screen[0] >= rect.x && screen[0] <= rect.x + rect.w && screen[1] >= rect.y && screen[1] <= rect.y + rect.h);

    const handlePointerDown = event => {
      const current = live.current;
      if (!current.sketch?.state || current.box) return;
      if (event.button !== 0 || event.altKey) return;
      const screen = localPoint(event);
      const place = mapping?.toLocal(screen);
      if (!place) return;
      pointer = { screen, local: place };
      const tool = current.tool;
      const extend = event.ctrlKey || event.metaKey || event.shiftKey;
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
        drag = { id: hit, from: place, to: place, screen, moved: false, pointerId: event.pointerId, controls, controlsWereEnabled: controls?.enabled !== false };
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
        version.current += 1;
        return;
      }
      if (event.buttons !== 0) return; // the camera turning
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
      const over = !current.tool || current.tool === "dimension"
        ? label?.id || (place && current.sketch?.state ? hitTest(current.sketch.state, place, HIT_PX / (mapping?.perUnit || 1)) : null) : null;
      if (over !== hover) hover = over;
      host.style.cursor = current.tool && current.tool !== "dimension" ? "crosshair" : over ? "pointer" : "";
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
      if (!done.moved) return;
      const op = dragOp(live.current.sketch.state, done, live.current.units);
      if (op) void send(op);
    };

    const handleDoubleClick = event => {
      const current = live.current;
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

// The points a drag moves: a point itself; a line's two ends together; a circle's or an arc's center.
function dragPoints(state, id) {
  const curve = (state.curves || []).find(each => each.id === id);
  if (!curve) return [id];
  if (curve.kind === "line") return [curve.start, curve.end];
  return [curve.center];
}

/** The sketch drawn with a drag's points where the pointer has them. */
function draggedState(state, drag) {
  const delta = [drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]];
  const moving = new Set(dragPoints(state, drag.id).filter(id => {
    const point = state.points.find(each => each.id === id);
    return point && !point.defined;
  }));
  return { ...state, points: state.points.map(point => (moving.has(point.id) ? { ...point, x: point.x + delta[0], y: point.y + delta[1] } : point)) };
}

/** What a drag sends: the points it moved, to where the pointer left them, to the part's precision. */
function dragOp(state, drag, units) {
  const delta = [drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]];
  const points = dragPoints(state, drag.id)
    .map(id => state.points.find(point => point.id === id))
    .filter(point => point && !point.defined && point.id !== "Origin")
    .map(point => ({ point: point.id, to: rounded([point.x + delta[0], point.y + delta[1]], units) }));
  return points.length ? { kind: "move", points } : null;
}
