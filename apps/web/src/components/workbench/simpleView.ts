import { create } from "zustand";

import type { ViewerEditState } from "./viewerEditState";

const STORAGE_KEY = "studio:simple-view";

/**
 * The choice as storage keeps it: AI (on) where none was ever kept, or storage is off, as AI is
 * home; a kept CAD ("0") stays CAD.
 */
export function readSimpleView(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * The AI | CAD choice, kept as Simple view: on is AI, the CAD viewer's ai layout, text-to-cad's view
 * exactly as it ships; off is CAD, the full workspace, its manual layout (`modeOf`, `simpleOf`).
 * Studio's bar's switch sets it (`ModeSwitch.tsx`, `StudioPanelBar.tsx`) and every
 * CAD view takes it from its host context (`PluginViewFrame.tsx`, `studio/editLayout`); a double-click
 * in the view asks for it too (`studio/request/edit-layout`). One choice for the person across
 * projects, kept on this device; AI the first time.
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

/** The switch's name for the choice: Simple view on is AI, off is CAD. */
export function modeOf(simple: boolean): "ai" | "cad" {
  return simple ? "ai" : "cad";
}

/** The stored choice for a mode of the switch; the other way of `modeOf`. */
export function simpleOf(mode: "ai" | "cad"): boolean {
  return mode === "ai";
}

/**
 * The AI | CAD switch's state for the view in front, by what it says of its part: hidden where the viewer
 * has one layout (a STEP with no part script, a board, the home) or the view has said nothing, held
 * while a command or sketch is open in it.
 */
export function simpleViewToggle(state: ViewerEditState | undefined): "hidden" | "shown" | "held" {
  if (state === undefined || !state.editable) return "hidden";
  return state.busy ? "held" : "shown";
}
