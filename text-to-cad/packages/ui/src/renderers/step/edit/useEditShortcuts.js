import { useContext, useEffect, useRef } from "react";
import { ViewerElementContext } from "../../../host/context.js";
import { isEditableTarget } from "../../kit/viewport/dom.js";

/**
 * Undo and Redo from the keyboard while edit mode is up, as a CAD tool takes them: Cmd+Z (Ctrl+Z),
 * and Shift+Cmd+Z or Ctrl+Y; and F2, Rename on what the design tree has selected. Only the viewer that owns the key acts on it, as the viewer's own
 * shortcuts decide (`kit/shell/useViewerShortcuts.js`): focus inside it, or the page background
 * after the last press was inside it. A text field keeps its own Undo.
 *
 * @param {ReturnType<typeof import("./useEditMode.js").useEditMode>} edit
 * @param {boolean} active edit mode is up for this file.
 */
export function useEditShortcuts(edit, active) {
  const viewerElement = useContext(ViewerElementContext);
  const latest = useRef(edit);
  latest.current = edit;
  useEffect(() => {
    if (!active) return undefined;
    let pointerInside = false;
    const onPointerDown = event => { pointerInside = Boolean(viewerElement?.current?.contains(event.target)); };
    const onKeyDown = event => {
      const element = viewerElement?.current;
      if (!element || event.defaultPrevented || event.altKey) return;
      // The drawing's sheet, up in the view, takes its own keys (`SheetEditor.jsx`).
      if (latest.current.sheetView) return;
      // F2 renames what is selected in the design tree, as in SolidWorks.
      if (event.key === "F2" && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
        const target = event.target;
        const inViewer = target instanceof Node && element.contains(target);
        const background = target === document.body || target === document.documentElement || target === document;
        if ((!inViewer && !(background && pointerInside)) || isEditableTarget(target) || !latest.current.selected) return;
        event.preventDefault();
        latest.current.startRename?.(latest.current.selected);
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      // Cmd+8 (Ctrl+8), Normal To, as SolidWorks takes it: the sketch's plane, or the face or plane selected.
      if (key === "8" && !event.shiftKey) {
        const target = event.target;
        if (!(target instanceof Node && element.contains(target)) && !(pointerInside && (target === document.body || target === document.documentElement))) return;
        if (isEditableTarget(target)) return;
        event.preventDefault();
        latest.current.lookNormalTo?.();
        return;
      }
      const redo = (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey);
      if (key !== "z" && !redo) return;
      const target = event.target;
      const inViewer = target instanceof Node && element.contains(target);
      const background = target === document.body || target === document.documentElement || target === document;
      if ((!inViewer && !(background && pointerInside)) || isEditableTarget(target)) return;
      const current = latest.current;
      if (redo ? !current.canRedo : !current.canUndo) return;
      event.preventDefault();
      event.stopPropagation();
      void (redo ? current.redo() : current.undo());
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [active, viewerElement]);
}
