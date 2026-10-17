import { pluginFileHandlers } from "@t3tools/client-runtime/state/plugins";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { pluginAppSurface } from "../plugins/pluginSurfaces";

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
      if (threadRef === null) return;
      const panels = useRightPanelStore.getState();
      const viewer = plugins === undefined ? undefined : pluginFileHandlers(plugins, path)[0];
      if (viewer !== undefined) panels.openPluginApp(threadRef, pluginAppSurface(viewer, path));
      else panels.openFile(threadRef, path, line);
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
  return useCallback(
    (path: string) => {
      const panels = useRightPanelStore.getState();
      const viewer = plugins === undefined ? undefined : pluginFileHandlers(plugins, path)[0];
      if (viewer !== undefined) panels.openPluginApp(threadRef, pluginAppSurface(viewer, path));
      else panels.openFile(threadRef, path);
    },
    [plugins, threadRef],
  );
}
