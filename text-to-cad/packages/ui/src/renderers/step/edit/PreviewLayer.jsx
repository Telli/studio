import { useEffect, useRef } from "react";
import { cadColors, modelMapping, PREVIEW_FILL_ALPHA, screenTriangles } from "./sketchDrawing.js";

// One solid of the preview: its triangles shaded once over all they cover, and its edges.
function drawSolid(context, solid, mapping, fill, stroke) {
  const shaded = screenTriangles(solid.positions || [], solid.triangles || [], mapping.toScreen);
  if (shaded.length) {
    context.save();
    context.globalAlpha = PREVIEW_FILL_ALPHA;
    context.fillStyle = fill;
    context.beginPath();
    for (let at = 0; at < shaded.length; at += 6) {
      context.moveTo(shaded[at], shaded[at + 1]);
      context.lineTo(shaded[at + 2], shaded[at + 3]);
      context.lineTo(shaded[at + 4], shaded[at + 5]);
      context.closePath();
    }
    context.fill();
    context.restore();
  }
  context.save();
  context.strokeStyle = stroke;
  context.lineWidth = 1.5;
  context.beginPath();
  for (const points of solid.edges || []) {
    let drawing = false;
    for (let at = 0; at + 2 < points.length; at += 3) {
      const place = mapping.toScreen(points[at], points[at + 1], points[at + 2]);
      if (!place) { drawing = false; continue; }
      if (drawing) context.lineTo(place[0], place[1]);
      else context.moveTo(place[0], place[1]);
      drawing = true;
    }
  }
  context.stroke();
  context.restore();
}

/**
 * A feature's preview over the model, as SolidWorks previews a feature while its PropertyManager is
 * open: the material OK would take away shaded red and the material it would add amber, each with
 * its edges, as the extrude preview draws them (`SketchesLayer.jsx`), drawn over the model rather
 * than hidden inside it. `preview` is what `cadgen/edit` made of the open command without writing
 * it (`edit.featurePreview`: its `removed` and `added` solids, in the part's millimetres).
 *
 * @param {{ viewport: { runtimeRef: object, hostRef: object, viewerReadyTick: number },
 *   preview: { removed?: object | null, added?: object | null } | null }} props
 */
export default function PreviewLayer({ viewport, preview }) {
  const canvasRef = useRef(null);
  const live = useRef(preview);
  live.current = preview;

  useEffect(() => {
    const host = viewport.hostRef?.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    let frameId = 0;
    let painted = "";
    let shown = null;
    let cad = cadColors(host);
    const paint = () => {
      frameId = requestAnimationFrame(paint);
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      const dpr = window.devicePixelRatio || 1;
      const mapping = modelMapping(viewport.runtimeRef?.current, width, height);
      const drawn = live.current;
      const key = `${mapping?.key || ""}|${dpr}`;
      // Painted again only when the view moved or the preview changed.
      if (key === painted && drawn === shown) return;
      painted = key;
      shown = drawn;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        cad = cadColors(host);
      }
      const context = canvas.getContext("2d");
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      if (!mapping || !drawn) return;
      if (drawn.removed) drawSolid(context, drawn.removed, mapping, cad.cut, cad.cut);
      if (drawn.added) drawSolid(context, drawn.added, mapping, cad.solid, cad.solidEdge);
    };
    frameId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frameId);
  }, [viewport.hostRef, viewport.runtimeRef, viewport.viewerReadyTick]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true" data-cad-feature-preview="" />;
}
