import type { ScopedThreadRef } from "@t3tools/contracts";

import { useRightPanelStore } from "~/rightPanelStore";

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
