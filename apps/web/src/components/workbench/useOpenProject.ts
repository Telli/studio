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
import { buildThreadRouteParams } from "~/threadRoutes";
import { readOpened, rememberOpened, threadToOpen } from "./openedThreads";
import { showChat, showProject } from "./overviewPanel";
import { waitingChat } from "./recentActivity";
import { foldSidebarForPart } from "./sidebarFold";

/** Remembers the thread on screen as the one last open in its project. */
export function useRememberOpened(threadRef: ScopedThreadRef | null): void {
  const threadKey = threadRef === null ? null : scopedThreadKey(threadRef);
  useEffect(() => {
    if (threadKey !== null) rememberOpened(threadKey, new Date().toISOString());
  }, [threadKey]);
}

/**
 * Opens a project, or a folder in no project: in the thread last open in it,
 * else the one last worked on, else a new one in its first folder, with its
 * part beside the chat in CAD mode (`showProject`: the part left open, else its
 * main part, else its Overview across the window), or what `show` puts there (a
 * part, from the quick find). A chat waiting on the person (a question, an
 * approval) is where a project opens without a `show`, beside its panel. The
 * sidebar folds for it (`foldSidebarForPart`).
 */
export function useOpenProject() {
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  return useCallback(
    async (
      folder: EnvironmentProject | null,
      threads: ReadonlyArray<EnvironmentThreadShell>,
      show?: (ref: ScopedThreadRef) => void,
    ) => {
      const asking = show === undefined ? waitingChat(threads) : null;
      const thread = asking ?? threadToOpen(threads, readOpened());
      if (thread !== null) {
        foldSidebarForPart();
        const ref = scopeThreadRef(thread.environmentId, thread.id);
        (asking !== null ? showChat : (show ?? showProject))(ref);
        await navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
        return;
      }
      if (folder === null) return;
      const draft = await handleNewThread(scopeProjectRef(folder.environmentId, folder.id));
      if (draft !== null) {
        foldSidebarForPart();
        (show ?? showProject)(scopeThreadRef(folder.environmentId, draft.threadId));
      }
    },
    [navigate, handleNewThread],
  );
}
