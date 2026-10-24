import { create } from "zustand";

import type { ViewerEditState } from "./viewerEditState";

const STORAGE_KEY = "studio:simple-view";

/** The choice as storage keeps it; off when nothing is kept or storage is off. */
function readSimpleView(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Simple view: the CAD viewer's ai layout, text-to-cad's view exactly as it ships; off, the full
 * workspace, its manual layout. Studio's bar turns it on and off (`StudioPanelBar.tsx`) and every
 * CAD view takes it from its host context (`PluginViewFrame.tsx`, `studio/editLayout`). One choice
 * for the person across projects, kept on this device; the full workspace the first time.
 */
export const useSimpleViewStore = create<{ readonly on: boolean }>()(() => ({
  on: readSimpleView(),
}));

export function useSimpleView(): boolean {
  return useSimpleViewStore((store) => store.on);
}

export function setSimpleView(on: boolean): void {
  useSimpleViewStore.setState({ on });
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Storage full or blocked: the choice still holds for the session.
  }
}

/** The viewer's own name for the layout (`text-to-cad/packages/ui/.../edit/editLayout.js`). */
export function viewerEditLayout(simple: boolean): "ai" | "manual" {
  return simple ? "ai" : "manual";
}

/**
 * Simple view's toggle for the view in front, by what it says of its part: hidden where the viewer
 * has one layout (a STEP with no part script, a board, the home) or the view has said nothing, held
 * while a command or sketch is open in it.
 */
export function simpleViewToggle(state: ViewerEditState | undefined): "hidden" | "shown" | "held" {
  if (state === undefined || !state.editable) return "hidden";
  return state.busy ? "held" : "shown";
}
