import { workspaceRelativePath } from "@t3tools/client-runtime/state/pluginFollow";
import { pluginFileHandlers } from "@t3tools/client-runtime/state/plugins";
import type {
  EnvironmentId,
  OrchestrationV2ProjectedTurnItem,
  OrchestrationV2TurnItem,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { useEffect } from "react";

import {
  type RightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import type { TurnDiffSummary } from "~/types";
import { pluginAppSurface } from "../plugins/pluginSurfaces";
import { useEngineeringInterface } from "./studioInterface";

/**
 * What a run makes that a person opens, best first: a document (a plan, a
 * report), then a table (a BOM), machine code (G-code), a picture. Source and
 * configuration never open: in the engineering interface code stays put away.
 */
const OUTPUT_RANKS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\.(?:md|mdx|pdf)$/i, 4],
  [/\.(?:csv|tsv)$/i, 3],
  [/\.(?:nc|gcode|ngc|tap|gco)$/i, 3],
  [/\.(?:png|jpe?g|webp|gif|svg)$/i, 2],
  [/\.(?:txt|html?)$/i, 1],
];
/** Files that instruct the agent, or that a repository keeps for itself: not the agent's work. */
const NOT_AN_OUTPUT =
  /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|README|CHANGELOG|LICENSE|CONTRIBUTING)\.md$|(?:^|\/)brief\/brief\.json$/i;

export function outputRank(path: string): number {
  if (NOT_AN_OUTPUT.test(path)) return 0;
  // Tool folders (`.claude/`, `.github/`) and environments hold configuration, not work.
  if (path.split("/").some((segment) => segment.startsWith(".") || segment === "node_modules")) {
    return 0;
  }
  return OUTPUT_RANKS.find(([pattern]) => pattern.test(path))?.[1] ?? 0;
}

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
    return relative !== null && outputRank(relative) > 0 ? [relative] : [];
  });
}

/** The best output among paths: the highest rank, the last of equals. */
export function bestOutput(paths: ReadonlyArray<string>): string | null {
  let best: { readonly path: string; readonly rank: number } | null = null;
  for (const path of paths) {
    const rank = outputRank(path);
    if (rank > 0 && (best === null || rank >= best.rank)) best = { path, rank };
  }
  return best?.path ?? null;
}

// Per thread for the session: runs seen live, and the items and checkpoints already followed.
const followed = new Map<
  string,
  { readonly runs: Set<string>; readonly items: Set<string>; readonly checkpoints: Set<string> }
>();

/**
 * In the engineering interface, what the agent makes opens as soon as it is
 * made. A document, a table, G-code or a picture it writes opens as a file
 * beside the thread; when the run ends, its checkpoint names what its
 * commands made too (G-code a CAM plan posts, a BOM), and the best of those
 * opens, or a model, board or drawing opens in the viewer when none is open.
 * Only runs seen live: opening an old thread never replays its finished runs.
 */
export function useDocumentFollow(input: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly threadKey: string | null;
  readonly runningRunId: string | null;
  readonly items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>;
  readonly checkpoints: ReadonlyArray<TurnDiffSummary>;
  readonly workspaceRoot: string | null;
}) {
  const { environmentId, threadRef, threadKey, runningRunId, items, checkpoints, workspaceRoot } =
    input;
  const engineering = useEngineeringInterface();
  const list = useEnvironmentQuery(
    engineering && threadRef !== null ? pluginEnvironment.list({ environmentId, input: {} }) : null,
  );
  const plugins = list.data?.plugins;

  useEffect(() => {
    if (!engineering || threadKey === null || runningRunId === null) return;
    let state = followed.get(threadKey);
    if (state === undefined) {
      state = { runs: new Set(), items: new Set(), checkpoints: new Set() };
      followed.set(threadKey, state);
    }
    state.runs.add(runningRunId);
  }, [engineering, threadKey, runningRunId]);

  useEffect(() => {
    if (!engineering || threadRef === null || threadKey === null) return;
    const state = followed.get(threadKey);
    if (state === undefined) return;
    const open = (relativePath: string) => {
      const panels = useRightPanelStore.getState();
      const surface: Extract<RightPanelSurface, { kind: "file" }> = {
        id: `file:${relativePath}`,
        kind: "file",
        relativePath,
        revealLine: null,
        revealRequestId: 0,
      };
      panels.openProactive(threadRef, surface, panels.getUserActionRevision(threadRef));
    };

    const written: string[] = [];
    for (const { item } of items) {
      if (item.runId === null || !state.runs.has(item.runId) || state.items.has(item.id)) continue;
      if (item.status !== "completed") continue;
      state.items.add(item.id);
      written.push(...writtenDocuments(item, workspaceRoot));
    }
    const document = bestOutput(written);
    if (document !== null) open(document);

    for (const checkpoint of checkpoints) {
      const key = `${checkpoint.runId}:${checkpoint.checkpointTurnCount}`;
      if (!state.runs.has(checkpoint.runId) || state.checkpoints.has(key)) continue;
      state.checkpoints.add(key);
      const paths = checkpoint.files.map((file) => file.path);
      const output = bestOutput(paths);
      if (output !== null) {
        if (output !== document) open(output);
        continue;
      }
      // A model, board or drawing its commands made: into the viewer, unless one is open
      // already (it refreshes itself, and the agent switches it with cad_show).
      if (plugins === undefined) continue;
      const panel = selectThreadRightPanelState(
        useRightPanelStore.getState().byThreadKey,
        threadRef,
      );
      if (panel.surfaces.some((surface) => surface.kind === "plugin-app")) continue;
      for (const path of paths.toReversed()) {
        const choice = pluginFileHandlers(plugins, path)[0];
        if (choice === undefined) continue;
        const panels = useRightPanelStore.getState();
        panels.openProactive(
          threadRef,
          pluginAppSurface(choice, path),
          panels.getUserActionRevision(threadRef),
        );
        break;
      }
    }
  }, [engineering, threadRef, threadKey, items, checkpoints, workspaceRoot, plugins]);
}
