import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useRightPanelStore } from "~/rightPanelStore";
import { buildThreadRouteParams } from "~/threadRoutes";
import { readOpened, rememberOpened, threadToOpen } from "./openedThreads";

/** Remembers the thread on screen as the one last open in its project. */
export function useRememberOpened(threadRef: ScopedThreadRef | null): void {
  const threadKey = threadRef === null ? null : scopedThreadKey(threadRef);
  useEffect(() => {
    if (threadKey !== null) rememberOpened(threadKey, new Date().toISOString());
  }, [threadKey]);
}

/** The Project tab in front: the Overview. */
const showOverview = (ref: ScopedThreadRef) => useRightPanelStore.getState().open(ref, "files");

/**
 * Opens a project, or a folder in no project, on its page: in the thread last
 * open in it, else the one last worked on, else a new one in its first folder,
 * with the Project tab in front, or what `show` puts there (a part, from the
 * quick find). The CAD tab stays a click away.
 */
export function useOpenProject() {
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  return useCallback(
    async (
      folder: EnvironmentProject | null,
      threads: ReadonlyArray<EnvironmentThreadShell>,
      show: (ref: ScopedThreadRef) => void = showOverview,
    ) => {
      const thread = threadToOpen(threads, readOpened());
      if (thread !== null) {
        const ref = scopeThreadRef(thread.environmentId, thread.id);
        show(ref);
        await navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
        return;
      }
      if (folder === null) return;
      const draft = await handleNewThread(scopeProjectRef(folder.environmentId, folder.id));
      if (draft !== null) show(scopeThreadRef(folder.environmentId, draft.threadId));
    },
    [navigate, handleNewThread],
  );
}
