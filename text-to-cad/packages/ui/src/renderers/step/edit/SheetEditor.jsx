import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ToolbarButton } from "@text-to-cad/ui/primitives/toolbar-button";
import { cn } from "@text-to-cad/ui/utils";
import { drawDrawing, modelToScreen, prepareDrawing, screenToModel } from "@text-to-cad/core/lib/drawing2d/index.js";
import { drawEntityHighlights, entityAt } from "@text-to-cad/core/lib/drawing2d/entities.js";
import { REFERENCE_HOVER_COLOR, REFERENCE_SELECTED_COLOR } from "@text-to-cad/core/lib/viewer/referenceGeometry.js";
import { ViewerElementContext } from "../../../host/context.js";
import { FLOATING_CHROME_SURFACE_CLASS } from "../../../lib/floatingSurface.js";
import { hasOpenPopup } from "../../../lib/popups.js";
import { readDrawingThemeColors } from "../../dxf/themeColors.js";
import { useDrawingView } from "../../dxf/useDrawingView.js";
import { TOUCH_HIT_PX, isEditableTarget } from "../../kit/viewport/dom.js";
import { SmartDimensionIcon } from "./sketchIcons.jsx";
import { DeleteDimensionIcon, RedoIcon, UndoIcon } from "./cadIcons.jsx";
import {
  alignMove, circleEdit, clampMove, deleteEdit, dimensionEdit, dimensionTarget, dimensionText, edgeEnds, moveEdit, movingTogether,
  ownerOf, placeDimension, sheetDimensions, sheetHint, viewAt
} from "./sheetEditing.js";

// How near a pick must be, in CSS pixels: a cursor's, or a fingertip's.
const PICK_PX = 6;
const pickPx = pointerType => (pointerType === "touch" ? TOUCH_HIT_PX : PICK_PX);
// How near a view placed by hand comes to lining up with another before it does, in CSS pixels.
const ALIGN_PX = 8;
const SNAP_PX = 3;
const ARROW_PX = 7;

/** The sheet's primitives in two drawings: a dragged view's (with its dimensions), and the rest, framed as the whole sheet is. */
function lift(payload, handles, bounds) {
  const moving = prepareDrawing({ ...payload, primitives: payload.primitives.filter(primitive => handles.has(primitive.entity)) });
  const rest = prepareDrawing({ ...payload, primitives: payload.primitives.filter(primitive => !handles.has(primitive.entity)) });
  return { moving, rest: { ...rest, bounds } };
}

/** A dimension line between two screen points, with its arrows and its value, as the preview of one being placed. */
function paintDimension(ctx, a, b, line, text) {
  const [p, q] = line;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]); ctx.lineTo(p[0], p[1]);
  ctx.moveTo(b[0], b[1]); ctx.lineTo(q[0], q[1]);
  ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
  ctx.stroke();
  const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  const ux = (q[0] - p[0]) / length, uy = (q[1] - p[1]) / length;
  for (const [tip, sign] of [[p, 1], [q, -1]]) {
    ctx.beginPath();
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(tip[0] + sign * ux * ARROW_PX - uy * ARROW_PX * 0.35, tip[1] + sign * uy * ARROW_PX + ux * ARROW_PX * 0.35);
    ctx.lineTo(tip[0] + sign * ux * ARROW_PX + uy * ARROW_PX * 0.35, tip[1] + sign * uy * ARROW_PX - ux * ARROW_PX * 0.35);
    ctx.closePath();
    ctx.fill();
  }
  ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(text, (p[0] + q[0]) / 2 - uy * 4, (p[1] + q[1]) / 2 + ux * 4 - 3);
}

/**
 * The part's drawing worked on its sheet, in the view, as a SolidWorks drawing is: drag a view
 * where it goes (the top, front and right views move together, as `three_views` placed them, and
 * the isometric or a view placed by hand alone, lining up with the others' centres); pick a
 * dimension and Delete takes it off; Smart Dimension picks two points of a view and the third
 * pick places the dimension, or a circle gives its size. Each change is written into the
 * drawing's script and the sheet drawn again (`edit.sheetEdit`), with its own Undo and Redo.
 * Escape steps back: the dimension being placed, then Smart Dimension, the pick, then the sheet.
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, colorScheme?: "light" | "dark" }} props
 */
export default function SheetEditor({ edit, colorScheme = "light" }) {
  const view = edit.sheetView;
  const sheetPayload = view?.payload || null;
  const sheet = sheetPayload?.sheet || null;
  const prepared = useMemo(() => {
    try { return sheetPayload ? prepareDrawing(sheetPayload) : null; } catch { return null; }
  }, [sheetPayload]);
  const dimensions = useMemo(() => sheetDimensions(sheet), [sheet]);
  const [tool, setTool] = useState("select");
  const [selected, setSelected] = useState(null);
  const [picks, setPicks] = useState([]);
  const [note, setNote] = useState("");
  // A view being dragged, or its move being drawn: its drawing lifted off the rest (`lift`).
  const [lifted, setLifted] = useState(null);
  const shift = useRef({ by: [0, 0], guides: [] });
  const hover = useRef(null);
  const cursor = useRef(null);
  const busy = Boolean(view?.busy);

  // What the handlers read, as they are made once.
  const live = useRef({});
  live.current = { edit, sheet, sheetPayload, prepared, dimensions, tool, selected, picks, lifted, busy };

  // A new sheet: what was picked on the last one is gone, and a move drawn is now the sheet's.
  useEffect(() => { setLifted(null); setPicks([]); setSelected(current => (current && dimensions.has(current) ? current : null)); }, [sheetPayload, dimensions]);
  useEffect(() => { if (!busy) setLifted(current => (current?.dropped ? null : current)); }, [busy]);
  useEffect(() => { setPicks([]); setNote(""); }, [tool]);

  const overlay = useCallback((ctx, { transform, pixelRatio }) => {
    const { sheet: drawn, prepared: whole, dimensions: listed, selected: chosen, tool: inHand, picks: picked, lifted: up } = live.current;
    if (!drawn || !whole) return;
    const handlesOf = key => listed.get(key)?.handles || [];
    const resting = hover.current;
    drawEntityHighlights(ctx, up?.rest || whole, { transform, pixelRatio, selected: chosen ? handlesOf(chosen) : [],
      hovered: resting?.dimension ? handlesOf(resting.dimension) : [] });
    if (up) {
      const { by } = shift.current;
      const moved = { scale: transform.scale, offsetX: transform.offsetX + by[0] * transform.scale, offsetY: transform.offsetY - by[1] * transform.scale };
      drawDrawing(ctx, up.moving, { transform: moved, foreground: readDrawingThemeColors(ctx.canvas, colorScheme).foreground, pixelRatio });
    }
    ctx.save();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const screen = point => modelToScreen(transform, point[0], point[1]);
    ctx.lineWidth = 1.25;
    if (up) {
      // Where the views go, and what they line up with.
      ctx.strokeStyle = REFERENCE_SELECTED_COLOR;
      ctx.setLineDash([5, 4]);
      for (const each of up.views) {
        const [x0, x1, y0, y1] = each.box, [dx, dy] = shift.current.by;
        const [left, topEdge] = screen([x0 + dx, y1 + dy]), [right, bottom] = screen([x1 + dx, y0 + dy]);
        ctx.strokeRect(left, topEdge, right - left, bottom - topEdge);
      }
      for (const [from, to] of shift.current.guides) {
        const [ax, ay] = screen(from), [bx, by] = screen(to);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
      ctx.setLineDash([]);
    } else if (resting?.view && inHand === "select") {
      const [x0, x1, y0, y1] = resting.view.box;
      const [left, topEdge] = screen([x0, y1]), [right, bottom] = screen([x1, y0]);
      ctx.strokeStyle = REFERENCE_HOVER_COLOR;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(left - 6, topEdge - 6, right - left + 12, bottom - topEdge + 12);
      ctx.setLineDash([]);
    }
    if (inHand === "dimension") {
      const target = resting?.target || null;
      const shownView = picked[0]?.view || resting?.view || null;
      // The points Smart Dimension can take in the view under the pointer.
      ctx.strokeStyle = REFERENCE_HOVER_COLOR;
      for (const snap of shownView?.snaps || []) {
        const [x, y] = screen(snap.at);
        ctx.beginPath(); ctx.arc(x, y, SNAP_PX, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = REFERENCE_SELECTED_COLOR;
      ctx.strokeStyle = REFERENCE_SELECTED_COLOR;
      if (target?.kind === "point") {
        const [x, y] = screen(target.snap.at);
        ctx.beginPath(); ctx.arc(x, y, SNAP_PX + 1.5, 0, Math.PI * 2); ctx.fill();
      } else if (target?.kind === "circle") {
        const [x, y] = screen(target.circle.at);
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, target.circle.radius * transform.scale, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.25;
      } else if (target?.kind === "edge") {
        const [a, b] = target.ends.map(snap => screen(snap.at));
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.lineWidth = 1.25;
      }
      for (const pick of picked) {
        const [x, y] = screen(pick.snap.at);
        ctx.beginPath(); ctx.arc(x, y, SNAP_PX + 1.5, 0, Math.PI * 2); ctx.fill();
      }
      const at = cursor.current;
      if (picked.length === 2 && at) {
        const placed = placeDimension(picked[0].snap.at, picked[1].snap.at, at);
        paintDimension(ctx, screen(picked[0].snap.at), screen(picked[1].snap.at), placed.line.map(screen),
          dimensionText(placed.value, picked[0].view.scale, drawn.units));
      } else if (picked.length === 1 && at) {
        const [ax, ay] = screen(picked[0].snap.at), [bx, by] = screen(at);
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }, [colorScheme]);

  const viewRef = useRef(null);
  const handlers = useMemo(() => {
    const at = (point, pointerType) => {
      const transform = viewRef.current?.transformRef.current;
      return transform ? { point: screenToModel(transform, point.x, point.y), reach: pickPx(pointerType) / transform.scale, transform } : null;
    };
    const repaint = () => viewRef.current?.requestPaint();
    const setCursor = value => { const canvas = viewRef.current?.canvasRef.current; if (canvas && canvas.style.cursor !== value) canvas.style.cursor = value; };
    // What Smart Dimension takes under a point: a snap, a circle, or a straight edge of the view.
    const targetAt = (drawn, whole, where, reach, inView) => {
      const found = inView ? dimensionTarget(inView, where, reach) : null;
      if (found) return found;
      const handle = whole ? entityAt(whole, where, reach) : "";
      const info = handle ? drawn.sources?.[handle] : null;
      if (!info || info.kind !== "view" || info.view !== inView?.view) return null;
      const segment = whole.entities.get(handle)?.primitives?.find(primitive => primitive.type === "lines" && primitive.geometry.length === 1);
      const ends = segment ? edgeEnds(inView, segment.geometry[0]) : null;
      return ends ? { kind: "edge", ends } : null;
    };

    const tap = (point, event) => {
      const current = live.current;
      const { sheet: drawn, prepared: whole } = current;
      const place = at(point, event.pointerType);
      if (!drawn || !whole || !place || current.busy) return;
      if (current.tool !== "dimension") {
        const owner = ownerOf(drawn, current.dimensions, entityAt(whole, place.point, place.reach));
        setSelected(owner?.dimension?.key || null);
        return;
      }
      const picked = current.picks;
      if (picked.length === 2) {
        // The third pick places it.
        const placed = placeDimension(picked[0].snap.at, picked[1].snap.at, place.point);
        setPicks([]);
        void current.edit.sheetEdit(dimensionEdit(drawn, picked[0].view, picked[0].snap, picked[1].snap, placed));
        return;
      }
      const inView = picked[0]?.view || viewAt(drawn, place.point, place.reach);
      if (!inView) return;
      if (inView.name === "iso") { setNote("An isometric view's lengths are foreshortened. Dimension the top, front or right view."); return; }
      const target = targetAt(drawn, whole, place.point, place.reach, inView);
      if (!target) {
        if (picked.length && viewAt(drawn, place.point, place.reach) !== inView) setNote("Both points of a dimension are in one view.");
        return;
      }
      setNote("");
      if (target.kind === "circle") {
        if (!picked.length) void current.edit.sheetEdit(circleEdit(drawn, inView, target.circle));
        return;
      }
      if (target.kind === "edge") {
        if (!picked.length) setPicks(target.ends.map(snap => ({ view: inView, snap })));
        return;
      }
      if (picked.length && picked[0].snap === target.snap) return;
      setPicks([...picked, { view: inView, snap: target.snap }]);
    };

    const hoverAt = (point, event) => {
      const current = live.current;
      const { sheet: drawn, prepared: whole } = current;
      const place = point ? at(point, event?.pointerType) : null;
      cursor.current = place?.point || null;
      if (!drawn || !whole || !place) { hover.current = null; setCursor(""); repaint(); return; }
      if (current.tool === "dimension") {
        const inView = current.picks[0]?.view || viewAt(drawn, place.point, place.reach);
        const target = inView && inView.name !== "iso" ? targetAt(drawn, whole, place.point, place.reach, inView) : null;
        hover.current = { view: inView, target };
        setCursor(target || current.picks.length === 2 ? "crosshair" : "default");
        repaint();
        return;
      }
      const owner = ownerOf(drawn, current.dimensions, entityAt(whole, place.point, place.reach));
      const over = owner?.dimension ? { dimension: owner.dimension.key } : (owner?.view || viewAt(drawn, place.point, place.reach))
        ? { view: owner?.view || viewAt(drawn, place.point, place.reach) } : null;
      hover.current = over;
      setCursor(over?.dimension ? "pointer" : over?.view ? "move" : "");
      repaint();
    };

    // A press on a view (not on one of its dimensions) drags it, and the views that move with it.
    const grab = (point, event) => {
      const current = live.current;
      const { sheet: drawn, prepared: whole, sheetPayload: payload } = current;
      const place = at(point, event.pointerType);
      if (current.tool !== "select" || current.busy || !drawn || !whole || !place) return null;
      const owner = ownerOf(drawn, current.dimensions, entityAt(whole, place.point, place.reach));
      if (owner?.dimension) return null;
      const target = owner?.view || viewAt(drawn, place.point, place.reach);
      if (!target) return null;
      const views = movingTogether(drawn, target);
      const numbers = new Set(views.map(each => each.view));
      const handles = new Set(Object.entries(drawn.sources || {}).filter(([, info]) => numbers.has(info.view)).map(([handle]) => handle));
      let up = null;
      const drop = () => { shift.current = { by: [0, 0], guides: [] }; setLifted(null); repaint(); };
      return {
        move(next) {
          if (!up) {
            up = { ...lift(payload, handles, whole.bounds), views };
            setLifted(up);
          }
          const now = screenToModel(place.transform, next.x, next.y);
          const aligned = alignMove(drawn, views, [now[0] - place.point[0], now[1] - place.point[1]], ALIGN_PX / place.transform.scale);
          const by = clampMove(drawn, views, aligned.by);
          shift.current = { by, guides: by[0] === aligned.by[0] && by[1] === aligned.by[1] ? aligned.guides : [] };
          repaint();
        },
        end() {
          const { by } = shift.current;
          if (!up || (Math.abs(by[0]) < 0.05 && Math.abs(by[1]) < 0.05)) { drop(); return; }
          // Drawn where it was dropped until the sheet comes back drawn again with it there.
          setLifted({ ...up, dropped: true });
          void Promise.resolve(live.current.edit.sheetEdit(moveEdit(drawn, target, by))).then(reply => { if (!reply?.ok) drop(); });
        },
        cancel: drop
      };
    };
    return { tap, hover: hoverAt, grab };
  }, []);

  const drawingView = useDrawingView({ drawing: lifted?.rest || prepared, colorScheme, onViewMoved: null, overlay,
    onTap: handlers.tap, onHover: handlers.hover, onGrab: handlers.grab });
  viewRef.current = drawingView;
  const { requestPaint } = drawingView;
  useEffect(() => { requestPaint(); }, [selected, picks, tool, lifted, requestPaint]);

  const remove = useCallback(() => {
    const current = live.current;
    const dimension = current.selected ? current.dimensions.get(current.selected) : null;
    if (!dimension || current.busy || !current.sheet) return false;
    setSelected(null);
    void current.edit.sheetEdit(deleteEdit(current.sheet, dimension));
    return true;
  }, []);

  // The keys a drawing takes, while the sheet is up: Delete, Escape, Undo and Redo.
  const viewerElement = useContext(ViewerElementContext);
  useEffect(() => {
    const onKeyDown = event => {
      if (event.defaultPrevented || event.altKey || isEditableTarget(event.target)) return;
      const element = viewerElement?.current;
      const target = event.target;
      const background = target === document.body || target === document.documentElement || target === document;
      if (element && !background && !(target instanceof Node && element.contains(target))) return;
      const current = live.current;
      const key = event.key.toLowerCase();
      let done = false;
      if (event.key === "Escape") {
        // A menu or a list open over the view takes its own Escape first.
        if (hasOpenPopup(element || null)) return;
        if (current.picks.length) setPicks([]);
        else if (current.tool !== "select") setTool("select");
        else if (current.selected) setSelected(null);
        else current.edit.closeSheet();
        done = true;
      } else if ((event.key === "Delete" || event.key === "Backspace") && !event.metaKey && !event.ctrlKey) {
        done = remove();
      } else if ((event.metaKey || event.ctrlKey) && (key === "z" || (key === "y" && event.ctrlKey && !event.metaKey))) {
        const redo = key === "y" || event.shiftKey;
        if (!current.busy) void (redo ? current.edit.redoSheet() : current.edit.undoSheet());
        done = true;
      }
      if (done) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [remove, viewerElement]);

  const index = view?.index || 1;
  const count = sheet?.count || 1;
  const said = view?.error || note || (sheet?.warnings?.length ? sheet.warnings[0] : "")
    || sheetHint({ tool, first: picks[0], selected, busy });
  const failed = Boolean(view?.error);
  // Up in the view under the workspace's toolbar, which floats over the view's top (`--cad-workspace-top`).
  return <div role="region" aria-label="Sheet" data-cad-sheet-editor="" className="absolute inset-x-0 bottom-0 z-20 flex flex-col bg-background"
    style={{ top: "var(--cad-workspace-top, 0px)" }}>
    <div ref={drawingView.containerRef} className="relative min-h-0 flex-1 overflow-hidden">
      <canvas ref={drawingView.canvasRef} className="absolute inset-0 touch-none" aria-label={`Sheet ${index} of ${count}`} />
      {!prepared ? <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
        {failed ? "" : "Drawing the sheet."}</p> : null}
    </div>
    <div role="toolbar" aria-label="Sheet tools" className={cn("absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-0.5 rounded-md p-0.5",
      FLOATING_CHROME_SURFACE_CLASS)}>
      <ToolbarButton label="Smart Dimension" active={tool === "dimension"} aria-pressed={tool === "dimension"} disabled={!prepared}
        onClick={() => setTool(current => (current === "dimension" ? "select" : "dimension"))}>
        <SmartDimensionIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Delete" disabled={!selected || busy} onClick={remove}><DeleteDimensionIcon className="size-4" /></ToolbarButton>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      <ToolbarButton label="Undo" disabled={!view?.undo?.length || busy} onClick={() => void edit.undoSheet()}><UndoIcon className="size-4" /></ToolbarButton>
      <ToolbarButton label="Redo" disabled={!view?.redo?.length || busy} onClick={() => void edit.redoSheet()}><RedoIcon className="size-4" /></ToolbarButton>
      {count > 1 ? <>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
        <ToolbarButton label="Previous sheet" disabled={index <= 1 || busy} onClick={() => void edit.openSheet(index - 1)}>
          <ChevronLeft className="size-4" /></ToolbarButton>
        <span className="px-1 text-tiny tabular-nums text-muted-foreground">{`Sheet ${index} of ${count}`}</span>
        <ToolbarButton label="Next sheet" disabled={index >= count || busy} onClick={() => void edit.openSheet(index + 1)}>
          <ChevronRight className="size-4" /></ToolbarButton>
      </> : null}
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      <ToolbarButton label="Close Sheet" onClick={edit.closeSheet}><X className="size-4" /></ToolbarButton>
    </div>
    <p aria-live="polite" className={cn("pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded-md px-2 py-1 text-tiny leading-4",
      FLOATING_CHROME_SURFACE_CLASS, failed ? "text-destructive" : "text-muted-foreground")}>
      {sheet ? `${sheet.size}, ${view?.payload?.file || ""}. ` : ""}{said}
    </p>
  </div>;
}
