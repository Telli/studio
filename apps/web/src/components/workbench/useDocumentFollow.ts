import { workspaceRelativePath } from "@t3tools/client-runtime/state/pluginFollow";
import type {
  OrchestrationV2ProjectedTurnItem,
  OrchestrationV2TurnItem,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { useEffect } from "react";

import { type RightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { useEngineeringInterface } from "./studioInterface";

/** Documents a person reads rather than edits: plans, reports, briefs, the PDFs the agent makes. */
const DOCUMENT = /\.(?:md|mdx|pdf)$/i;
/** Files that instruct the agent, or that a repository keeps for itself: not the agent's writing. */
const NOT_A_DOCUMENT =
  /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|README|CHANGELOG|LICENSE|CONTRIBUTING)\.md$/i;

/** The documents a settled file edit wrote, workspace-relative, deletions left out. */
export function writtenDocuments(item: OrchestrationV2TurnItem, root: string | null): string[] {
  if (item.type !== "file_change" || item.status !== "completed") return [];
  const changes = item.changes ?? [];
  const paths =
    changes.length === 0
      ? [item.fileName]
      : changes.filter((change) => !/^del/i.test(change.operation)).map((change) => change.path);
  return paths.flatMap((path) => {
    const relative = workspaceRelativePath(path, root);
    if (relative === null || !DOCUMENT.test(relative) || NOT_A_DOCUMENT.test(relative)) return [];
    // Tool folders (`.claude/`, `.github/`) hold configuration, not documents.
    return relative.split("/").some((segment) => segment.startsWith(".")) ? [] : [relative];
  });
}

// Per thread for the session: runs seen live, and the items already followed.
const followed = new Map<string, { readonly runs: Set<string>; readonly items: Set<string> }>();

/**
 * In the engineering interface, a document the agent writes during a run (a
 * plan, a report, a brief) opens beside the thread as a document, the way a
 * model it saves opens in the viewer. Only runs seen live: opening an old
 * thread never replays what its finished runs wrote.
 */
export function useDocumentFollow(input: {
  readonly threadRef: ScopedThreadRef | null;
  readonly threadKey: string | null;
  readonly runningRunId: string | null;
  readonly items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>;
  readonly workspaceRoot: string | null;
}) {
  const { threadRef, threadKey, runningRunId, items, workspaceRoot } = input;
  const engineering = useEngineeringInterface();

  useEffect(() => {
    if (!engineering || threadKey === null || runningRunId === null) return;
    let state = followed.get(threadKey);
    if (state === undefined) {
      state = { runs: new Set(), items: new Set() };
      followed.set(threadKey, state);
    }
    state.runs.add(runningRunId);
  }, [engineering, threadKey, runningRunId]);

  useEffect(() => {
    if (!engineering || threadRef === null || threadKey === null) return;
    const state = followed.get(threadKey);
    if (state === undefined) return;
    let latest: string | null = null;
    for (const { item } of items) {
      if (item.runId === null || !state.runs.has(item.runId) || state.items.has(item.id)) continue;
      if (item.status !== "completed") continue;
      state.items.add(item.id);
      latest = writtenDocuments(item, workspaceRoot).at(-1) ?? latest;
    }
    if (latest === null) return;
    const surface: Extract<RightPanelSurface, { kind: "file" }> = {
      id: `file:${latest}`,
      kind: "file",
      relativePath: latest,
      revealLine: null,
      revealRequestId: 0,
    };
    const panels = useRightPanelStore.getState();
    panels.openProactive(threadRef, surface, panels.getUserActionRevision(threadRef));
  }, [engineering, threadRef, threadKey, items, workspaceRoot]);
}
