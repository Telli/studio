import type { ScopedThreadRef } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { useEffect, useMemo } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { leadPartOf } from "./leadPart";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { usePanelTabShortcuts } from "./panelTabShortcuts";
import { PartActions } from "./PartActions";
import { handToChat } from "./NewDialog";
import { surfaceFile } from "./sameFile";
import { StudioNew } from "./StudioNew";
import { StudioTour } from "./StudioTour";
import { partName } from "./partNames";
import { usePartContext } from "./usePartContext";
import { useStudioProjectAt } from "./useStudioProjects";
import { editsByHand, useWorkspaceMode, useWorkspaceModeStore } from "./workspaceMode";

/** The thread folder's lead part, read again when the agent changes files. */
function useLeadPart(threadRef: ScopedThreadRef, folder: string | null, mutationId: string | null) {
  const listing = useEnvironmentQuery(
    folder === null
      ? null
      : projectEnvironment.listEntries({
          environmentId: threadRef.environmentId,
          input: { cwd: folder },
        }),
  );
  useWorkspaceMutationRefresh({
    enabled: folder !== null,
    mutationId,
    refresh: listing.refresh,
    resourceKey: `studio-lead-part:${folder ?? ""}`,
  });
  const entries = listing.data?.entries;
  return useMemo(
    () =>
      folder === null || entries === undefined
        ? null
        : leadPartOf([
            {
              root: folder,
              paths: entries
                .filter((entry) => entry.kind === "file" && entry.ignored !== true)
                .map((entry) => entry.path),
            },
          ]),
    [entries, folder],
  );
}

/**
 * The workspace panel's toolbar, under its tabs (`RightPanelTabs`' toolbar row), one line of what
 * can be done: over a part in the CAD viewer, Ask or Edit by hand (`editsByHand`; the mode is the
 * project's, `workspaceMode.ts`, which the CAD views take from the host context) and the part's
 * jobs (Evaluate, Manufacture, with the files to export, and Document), led by the project's way
 * of making it; and New, always there, at the row's right end (`StudioNew`), where Home has it.
 * ⌘K's jobs are for the part last on screen, else the lead part.
 */
export function StudioPanelBar(props: {
  readonly folder: string | null;
  readonly composerRef: ComposerHandleRef | null;
  readonly threadRef: ScopedThreadRef;
  /** The thread's workspace changes: a part the agent just made can be opened. */
  readonly mutationId: string | null;
}) {
  const { folder, threadRef } = props;
  const mode = useWorkspaceMode(folder);
  const setMode = useWorkspaceModeStore((store) => store.setMode);
  const setActiveFolder = useWorkspaceModeStore((store) => store.setActiveFolder);
  useEffect(() => {
    setActiveFolder(folder);
  }, [folder, setActiveFolder]);
  const lead = useLeadPart(threadRef, folder, props.mutationId);
  usePanelTabShortcuts(threadRef);
  // What is in front decides the row: over the Overview, the project's New; over a part, the
  // part's own ways of changing it (Ask, Edit by hand) and its jobs; over a document, nothing.
  const frontKind = useRightPanelStore(
    (store) => selectActiveRightPanelSurface(store.byThreadKey, threadRef)?.kind ?? null,
  );
  // A view the agent opened names its file only in its id (`surfaceFile`).
  const frontFile = useRightPanelStore((store) => {
    const surface = selectActiveRightPanelSurface(store.byThreadKey, threadRef);
    return surface?.kind === "plugin-app" ? surfaceFile(surface) : null;
  });
  const byHandShown = editsByHand(
    frontKind === null
      ? null
      : { kind: frontKind, ...(frontFile === null ? {} : { file: frontFile }) },
  );
  const shown = usePartContext(threadRef);
  const studio = useStudioProjectAt(threadRef.environmentId, folder);
  const subject =
    shown !== null
      ? { path: shown.part.path, kind: shown.part.kind }
      : lead === null
        ? null
        : { path: lead.file.path, kind: lead.file.kind };
  const process = studio?.project.brief.process;
  // The part in front, as the viewer shows it (it may have moved on from the file it opened).
  const inFront =
    frontKind !== "plugin-app"
      ? null
      : shown !== null
        ? { path: shown.part.path, kind: shown.part.kind }
        : frontFile === null
          ? null
          : { path: frontFile, kind: partName(frontFile)?.kind ?? "Part" };

  // ⌘K finds jobs for the same part, from over everything (`StudioQuickFind`).
  const setWorkspace = useOpenWorkspaceStore((store) => store.setWorkspace);
  const subjectPath = subject?.path ?? null;
  const subjectKind = subject?.kind ?? null;
  useEffect(() => {
    if (folder === null) return;
    setWorkspace({
      threadRef,
      folder,
      part:
        subjectPath === null || subjectKind === null
          ? null
          : { path: subjectPath, kind: subjectKind },
      process,
    });
    return () => setWorkspace(null);
  }, [folder, process, setWorkspace, subjectKind, subjectPath, threadRef]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" data-studio-toolbar="">
      <StudioTour />
      {byHandShown ? (
        <ToggleGroup
          aria-label="How to change the part"
          value={[mode]}
          onValueChange={(next) => {
            const value = next[0];
            if (folder !== null && (value === "ask" || value === "manual")) setMode(folder, value);
          }}
        >
          <Toggle value="ask">Ask</Toggle>
          <Toggle value="manual">Edit by hand</Toggle>
        </ToggleGroup>
      ) : null}
      {inFront === null || props.composerRef === null ? null : (
        <PartActions
          environmentId={threadRef.environmentId}
          file={serializeComposerFileLink(inFront.path)}
          kind={inFront.kind}
          process={process}
          composerRef={props.composerRef}
          inTopBar
        />
      )}
      {/* New closes the row, at its right, as it does Home's Your projects (beside Import). */}
      <div className="flex-1" />
      {props.composerRef === null || folder === null ? null : (
        <StudioNew
          environmentId={threadRef.environmentId}
          cwd={folder}
          onCreate={(job) => {
            if (props.composerRef !== null) handToChat(props.composerRef, job.prompt);
            // The job goes to this chat: the Overview steps back beside it, so the work shows.
            useRightPanelStore.getState().setMaximized(threadRef, false);
          }}
        />
      )}
    </div>
  );
}
