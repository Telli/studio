import type { ScopedThreadRef } from "@t3tools/contracts";

import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";

/**
 * Opens a project's Overview beside a chat, across the window as a Google Drive folder opens
 * (`ProjectEverything`): from the sidebar's Overview and the top bar's project name. Opening a
 * file or a chat from it, or New's Create, brings the chat back beside it.
 */
export function showOverview(threadRef: ScopedThreadRef): void {
  const panels = useRightPanelStore.getState();
  panels.open(threadRef, "files");
  panels.setMaximized(threadRef, true);
}

/**
 * Puts a panel tab in front as Studio shows each: the Overview across the window, as a Drive folder
 * opens, any other tab beside the chat. Leaving the Overview steps back from the window; a part
 * the person spread across the window themselves stays so.
 */
export function frontTab(
  threadRef: ScopedThreadRef,
  surface: { readonly id: string; readonly kind: string },
): void {
  const panels = useRightPanelStore.getState();
  const leaving = selectActiveRightPanelSurface(panels.byThreadKey, threadRef)?.kind === "files";
  panels.activateSurface(threadRef, surface.id);
  if (surface.kind === "files") panels.setMaximized(threadRef, true);
  else if (leaving) panels.setMaximized(threadRef, false);
}

/**
 * A chat picked to read (in the sidebar, in Cmd+K): its panel steps back beside it. Each chat keeps
 * its own panel, so one whose Overview was left across the window would otherwise open hidden.
 */
export function showChat(threadRef: ScopedThreadRef): void {
  useRightPanelStore.getState().setMaximized(threadRef, false);
}
