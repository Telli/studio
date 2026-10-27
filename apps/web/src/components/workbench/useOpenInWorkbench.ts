import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";
import { pluginFileHandlers } from "@t3tools/client-runtime/state/plugins";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { agentViewSurface, pluginAppSurface } from "../plugins/pluginSurfaces";
import { rememberRecentFile } from "./recentFiles";
import { sameFile, surfaceFile } from "./sameFile";

/**
 * Opens a file beside a thread: a model, board or drawing in the plugin view that claims it (a
 * STEP in the CAD view, never as text), anything else as a document, at its line, and remembers
 * it for Home's Recent (`recentFiles.ts`). Takes a path in the thread's folder, or a full path,
 * or a cadgen 0.8 model's document id, which opens in the CAD view (`openDocumentInPanel`).
 * Says whether a plugin view shows it: the one open already, or the one the plugins list for it.
 */
export function openInPanel(
  plugins: Parameters<typeof pluginFileHandlers>[0] | undefined,
  threadRef: ScopedThreadRef,
  path: string,
  line?: number,
): boolean {
  if (isDocumentId(path)) return openDocumentInPanel(plugins, threadRef, path);
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
    return open.kind === "plugin-app";
  }
  const viewer = plugins === undefined ? undefined : pluginFileHandlers(plugins, path)[0];
  if (viewer !== undefined) panels.openPluginApp(threadRef, pluginAppSurface(viewer, path));
  else panels.openFile(threadRef, path, line);
  return viewer !== undefined;
}

/** The view tool that shows a cadgen model by its document id: text-to-cad's `cad_open`. */
const DOCUMENT_VIEW_TOOL = "cad_open";

/**
 * Opens a cadgen model beside a thread by its document id (a 0.8 model has no file to open): in
 * the CAD view that shows one, as the agent's `cad_open` opens it, one tab per document; one open
 * already comes to the front. Says whether a view took it.
 */
export function openDocumentInPanel(
  plugins: Parameters<typeof pluginFileHandlers>[0] | undefined,
  threadRef: ScopedThreadRef,
  id: string,
): boolean {
  const panels = useRightPanelStore.getState();
  for (const plugin of plugins ?? []) {
    if (!plugin.enabled) continue;
    const view = plugin.views.find((candidate) => candidate.tool === DOCUMENT_VIEW_TOOL);
    if (view === undefined) continue;
    const surface = agentViewSurface(
      { pluginId: plugin.id, pluginName: plugin.displayName, view },
      { source: id },
      id,
    );
    const open = selectThreadRightPanelState(panels.byThreadKey, threadRef).surfaces.find(
      (shown) => shown.id === surface.id,
    );
    if (open !== undefined) panels.activateSurface(threadRef, open.id);
    else panels.openPluginApp(threadRef, surface);
    return true;
  }
  return false;
}

/**
 * Opens a file a chat link or file chip names: a model, board or drawing in
 * the plugin view that claims it (a STEP in the CAD view, never as text),
 * anything else in the file preview at its line. Takes a path in the thread's
 * folder, or a full path; without a thread it opens nothing. Says whether a
 * plugin view shows it (`openInPanel`).
 */
export function useOpenChatFile(threadRef: ScopedThreadRef | null) {
  const plugins = useEnvironmentQuery(
    threadRef === null
      ? null
      : pluginEnvironment.list({ environmentId: threadRef.environmentId, input: {} }),
  ).data?.plugins;
  return useCallback(
    (path: string, line?: number) =>
      threadRef !== null && openInPanel(plugins, threadRef, path, line),
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
