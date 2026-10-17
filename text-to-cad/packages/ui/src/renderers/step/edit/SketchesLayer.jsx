import { useEffect, useRef } from "react";
import { colorsFor, curvePoints, planeMapping, strokePath } from "./sketchDrawing.js";
import { sketchGeometry } from "./sketchMode.js";

/**
 * The part's sketches drawn on the model while none is being edited, as SolidWorks shows them: a
 * sketch nothing makes a solid of yet stays in view on its plane (blue where it can still move,
 * black where it is defined), and a sketch selected in the design tree is drawn highlighted, even
 * one a feature has taken in. Nothing here takes a press.
 *
 * @param {{ viewport: { runtimeRef: object, hostRef: object, viewerReadyTick: number },
 *   sketches: { file: string, line: number, state: object | null }[], selected?: { file: string, line: number } | null }} props
 */
export default function SketchesLayer({ viewport, sketches, selected = null }) {
  const canvasRef = useRef(null);
  const live = useRef(null);
  live.current = { sketches, selected };
  const version = useRef(0);
  version.current += 1;

  useEffect(() => {
    const host = viewport.hostRef?.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    let frameId = 0;
    let painted = "";
    let colors = colorsFor(host);
    const paint = () => {
      frameId = requestAnimationFrame(paint);
      const runtime = viewport.runtimeRef?.current;
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      const dpr = window.devicePixelRatio || 1;
      const { sketches: shown, selected: chosen } = live.current;
      const mappings = shown.map(view => (view.state ? planeMapping(runtime, width, height, view.state.frame, view.state.unit || 1) : null));
      const key = `${mappings.map(mapping => mapping?.key || "").join("/")}|${version.current}|${dpr}`;
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
      shown.forEach((view, index) => {
        const mapping = mappings[index];
        if (!mapping) return;
        const highlighted = chosen && chosen.file === view.file && chosen.line === view.line;
        for (const curve of sketchGeometry(view.state).curves) {
          context.strokeStyle = highlighted ? colors.selected : curve.defined ? colors.quiet : colors.under;
          context.lineWidth = highlighted ? 2 : 1.25;
          context.setLineDash(curve.construction ? [9, 4, 2, 4] : []);
          strokePath(context, curvePoints(curve), mapping.toScreen);
        }
        context.setLineDash([]);
      });
    };
    frameId = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frameId);
  }, [viewport.hostRef, viewport.runtimeRef, viewport.viewerReadyTick]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden="true" data-cad-sketches="" />;
}
