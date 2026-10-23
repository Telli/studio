import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useEffect, useRef } from "react";
import { create } from "zustand";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";

/**
 * Full screen for Edit by hand: the part takes the whole screen, as a CAD program's window does.
 * Studio's sidebar steps aside (`AppSidebarLayout`) and so does the chat, the workspace panel
 * maximized as T3 Code's own control does it, and the window goes full screen where a page may
 * ask for it (Electron's window and browsers do, from a click).
 */
export const useStudioFullScreen = create<{
  readonly on: boolean;
  readonly setOn: (on: boolean) => void;
}>()((set) => ({ on: false, setOn: (on) => set({ on }) }));

/**
 * The workspace's full screen and its switch, while Edit by hand has a part in front
 * (`available`). It ends with its button, when the window leaves full screen (Escape, or its own
 * control), when Ask or a panel with nothing to edit by hand comes in front, and with the
 * workspace; the panel goes back to how it was.
 */
export function useEditFullScreen(threadRef: ScopedThreadRef, available: boolean) {
  const on = useStudioFullScreen((store) => store.on);
  // Whether the panel was maximized before, to leave it so.
  const wasMaximized = useRef(false);
  const exit = useCallback(() => {
    const studio = useStudioFullScreen.getState();
    if (!studio.on) return;
    studio.setOn(false);
    useRightPanelStore.getState().setMaximized(threadRef, wasMaximized.current);
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [threadRef]);
  const enter = useCallback(() => {
    const panels = useRightPanelStore.getState();
    wasMaximized.current =
      selectThreadRightPanelState(panels.byThreadKey, threadRef).maximized === true;
    panels.setMaximized(threadRef, true);
    useStudioFullScreen.getState().setOn(true);
    // A window that may not go full screen still has the part across it.
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, [threadRef]);
  useEffect(() => {
    if (!on) return;
    const changed = () => {
      if (!document.fullscreenElement) exit();
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, [exit, on]);
  useEffect(() => {
    if (!available) exit();
  }, [available, exit]);
  useEffect(() => exit, [exit]);
  return { on, toggle: on ? exit : enter };
}
