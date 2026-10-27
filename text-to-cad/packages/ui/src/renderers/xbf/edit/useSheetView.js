import { useCallback, useRef } from "react";
import { APP_THEME_COLORS } from "@text-to-cad/core/lib/appTheme.js";
import { clearSurface, drawDrawing } from "@text-to-cad/core/lib/drawing2d/index.js";
import { cssColorToHex } from "../../kit/look/chromeBackdrop.js";
import { useFlatCanvasView } from "../../kit/viewport/useFlatCanvasView.js";

function token(element, name) {
  try {
    const view = element?.ownerDocument?.defaultView;
    return typeof view?.getComputedStyle === "function" ? view.getComputedStyle(element).getPropertyValue(name).trim() : "";
  } catch {
    return "";
  }
}

/**
 * The two colours a part's drawing sheet is painted in, `{ background, foreground }` as `#rrggbb`: the app's own `--background`
 * and `--foreground`, read off `element` when it is painted (a host switches its theme whenever it likes), else the app's
 * colours for `colorScheme` (`APP_THEME_COLORS`), as every flat drawing in the viewer is painted.
 *
 * @param {Element | null} element
 * @param {"light" | "dark"} colorScheme
 */
export function sheetColors(element, colorScheme = "light") {
  const fallback = colorScheme === "dark" ? APP_THEME_COLORS.dark : APP_THEME_COLORS.light;
  return {
    background: cssColorToHex(token(element, "--background")) || fallback.background,
    foreground: cssColorToHex(token(element, "--foreground")) || fallback.foreground,
  };
}

/**
 * The canvas a part's drawing sheet is painted on (`SheetEditor.jsx`), on the kit's flat view (`useFlatCanvasView`: drag to pan,
 * wheel or pinch to zoom, double-click to fit, and the tool in hand's tap, hover and grab): the sheet in the app's colours, and
 * what the sheet's tools draw over it (`overlay`) in the same frame. Painted on demand, never each frame.
 *
 * @param {{ drawing: object | null, colorScheme?: "light" | "dark",
 *   overlay?: ((ctx: CanvasRenderingContext2D, view: { transform: object, pixelRatio: number, width: number, height: number }) => void) | null,
 *   onTap?: Function | null, onHover?: Function | null, onGrab?: Function | null }} options
 */
export function useSheetView({ drawing, colorScheme = "light", overlay = null, onTap = null, onHover = null, onGrab = null }) {
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const paint = useCallback((ctx, { width, height, pixelRatio, transform, element, colorScheme: scheme }) => {
    const { background, foreground } = sheetColors(element, scheme);
    clearSurface(ctx, { width, height, pixelRatio, background });
    const drawable = drawingRef.current;
    if (!drawable || !transform) return;
    drawDrawing(ctx, drawable, { transform, foreground, pixelRatio });
    overlayRef.current?.(ctx, { transform, pixelRatio, width, height });
  }, []);
  const view = useFlatCanvasView({ content: drawing, bounds: drawing?.bounds ?? null, colorScheme, onViewMoved: null, paint, onTap, onHover, onGrab });
  return { containerRef: view.containerRef, canvasRef: view.canvasRef, transformRef: view.transformRef, requestPaint: view.requestPaint };
}
