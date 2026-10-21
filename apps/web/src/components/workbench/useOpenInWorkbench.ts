import { pluginFileHandlers } from "@t3tools/client-runtime/state/plugins";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { pluginAppSurface } from "../plugins/pluginSurfaces";
import { rememberRecentFile } from "./recentFiles";
import { sameFile, surfaceFile } from "./sameFile";

/**
 * Opens a file beside a thread: a model, board or drawing in the plugin view that claims it (a
 * STEP in the CAD view, never as text), anything else as a document, at its line, and remembers
 * it for Home's Recent (`recentFiles.ts`). Takes a path in the thread's folder, or a full path.
 */
export function openInPanel(
  plugins: Parameters<typeof pluginFileHandlers>[0] | undefined,
  threadRef: ScopedThreadRef,
  path: string,
  line?: number,
): void {
  const panels = useRightPanelStore.getState();
  rememberRecentFile(threadRef, path);
  // A file already open, however its path was written (in the folder, in full, by the agent),
  // comes to the front in its own tab rather than in a second one.
  const open = selectThreadRightPanelState(panels.byThreadKey, threadRef).surfaces.find(
    (surface) => {
      const file = surfaceFile(surface);
      return file !== null && sameFile(file, path);
    },
  );
  if (open !== undefined && (open.kind !== "file" || line === undefined)) {
    panels.activateSurface(threadRef, open.id);
    return;
  }
  const viewer = plugins === undefined ? undefined : pluginFileHandlers(plugins, path)[0];
  if (viewer !== undefined) panels.openPluginApp(threadRef, pluginAppSurface(viewer, path));
  else panels.openFile(threadRef, path, line);
}

/**
 * Opens a file a chat link or file chip names: a model, board or drawing in
 * the plugin view that claims it (a STEP in the CAD view, never as text),
 * anything else in the file preview at its line. Takes a path in the thread's
 * folder, or a full path; without a thread it opens nothing.
 */
export function useOpenChatFile(threadRef: ScopedThreadRef | null) {
  const plugins = useEnvironmentQuery(
    threadRef === null
      ? null
      : pluginEnvironment.list({ environmentId: threadRef.environmentId, input: {} }),
  ).data?.plugins;
  return useCallback(
    (path: string, line?: number) => {
      if (threadRef !== null) openInPanel(plugins, threadRef, path, line);
    },
    [plugins, threadRef],
  );
}

/**
 * Opens a project file beside the thread the way an engineer looks at it: a
 * model, board or drawing in the plugin view that claims it, anything else as
 * a document. Takes a path in the thread's folder, or a full path.
 */
export function useOpenInWorkbench(threadRef: ScopedThreadRef) {
  const plugins = useEnvironmentQuery(
    pluginEnvironment.list({ environmentId: threadRef.environmentId, input: {} }),
  ).data?.plugins;
  return useCallback((path: string) => openInPanel(plugins, threadRef, path), [plugins, threadRef]);
}
