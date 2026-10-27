import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { ImportDialogHost } from "./ImportDialog";
import { ImportMenu } from "./ImportMenu";
import { useImportIntoProject } from "./importIntoProject";
import { useImportActions } from "./useImportActions";
import { leadPartOf } from "./leadPart";
import { ModeSwitch } from "./ModeSwitch";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { usePanelTabShortcuts } from "./panelTabShortcuts";
import { handToChat } from "./handToChat";
import { surfaceFile } from "./sameFile";
import { modeOf, setSimpleView, simpleOf, simpleViewToggle, useSimpleView } from "./simpleView";
import { StudioNew } from "./StudioNew";
import { StudioTour } from "./StudioTour";
import { partName } from "./partNames";
import { useAddPart } from "./useNewPart";
import { usePartContext } from "./usePartContext";
import { useStudioProjectAt } from "./useStudioProjects";
import { frontViewBusy, pluginViewKey, useViewerEditState } from "./viewerEditState";

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
 * The part in front of the workspace panel, as the CAD viewer shows it (it may have moved on from
 * the file it opened), else as the view the agent opened names it; null over the Overview, a
 * document, or anything that is not a CAD view. With it, how the project's parts are made, from
 * its setup, which Manufacture leads with. The panel bar and the Toolbox show its jobs.
 */
export function usePartInFront(
  threadRef: ScopedThreadRef,
  folder: string | null,
): {
  readonly part: { readonly path: string; readonly kind: string } | null;
  readonly process: string | undefined;
  /** What the viewer in front says of its part (`usePartContext`), when it has said. */
  readonly shown: ReturnType<typeof usePartContext>;
} {
  const frontKind = useRightPanelStore(
    (store) => selectActiveRightPanelSurface(store.byThreadKey, threadRef)?.kind ?? null,
  );
  // A view the agent opened names its file only in its id (`surfaceFile`).
  const frontFile = useRightPanelStore((store) => {
    const surface = selectActiveRightPanelSurface(store.byThreadKey, threadRef);
    return surface?.kind === "plugin-app" ? surfaceFile(surface) : null;
  });
  const shown = usePartContext(threadRef);
  const process = useStudioProjectAt(threadRef.environmentId, folder)?.project.brief.process;
  const shownPath = shown?.part.path ?? null;
  const shownKind = shown?.part.kind ?? null;
  const part = useMemo(
    () =>
      frontKind !== "plugin-app"
        ? null
        : shownPath !== null && shownKind !== null
          ? { path: shownPath, kind: shownKind }
          : frontFile === null
            ? null
            : { path: frontFile, kind: partName(frontFile)?.kind ?? "Part" },
    [frontFile, frontKind, shownKind, shownPath],
  );
  return { part, process, shown };
}

/**
 * The workspace panel's toolbar, under its tabs (`RightPanelTabs`' toolbar row), one line of what
 * can be done: the AI | CAD switch where the viewer in front has two layouts (`ModeSwitch` over
 * `simpleView.ts`, the person's choice, which every CAD view takes from its host context), with Back to AI before it
 * in CAD; and Import (`ImportMenu`, Studio's one Import) and New, always
 * there, at the row's right end (`StudioNew`), where Home has them. A part's jobs are in the
 * Toolbox (`StudioToolbox`). ⌘K's jobs are for the part last on screen, else the lead part.
 */
export function StudioPanelBar(props: {
  readonly folder: string | null;
  readonly composerRef: ComposerHandleRef | null;
  readonly threadRef: ScopedThreadRef;
  /** The thread's workspace changes: a part the agent just made can be opened. */
  readonly mutationId: string | null;
}) {
  const { folder, threadRef } = props;
  const lead = useLeadPart(threadRef, folder, props.mutationId);
  usePanelTabShortcuts(threadRef);
  // The AI | CAD switch, by what the CAD view in front says of its part (`viewerEditState.ts`): shown
  // where it has two layouts, held while a command or sketch is open in it.
  const frontView = useRightPanelStore((store) => {
    const surface = selectActiveRightPanelSurface(store.byThreadKey, threadRef);
    return surface?.kind === "plugin-app" ? pluginViewKey(threadRef, surface.id) : null;
  });
  const simpleView = useSimpleView();
  const toggle = useViewerEditState((store) =>
    simpleViewToggle(frontView === null ? undefined : store.byView[frontView]),
  );
  // The part in front, for ⌘K; over the Overview or a document, there is none.
  const { shown, process } = usePartInFront(threadRef, folder);
  const studio = useStudioProjectAt(threadRef.environmentId, folder);
  const addPart = useAddPart(threadRef, folder);
  // ⌘K's part: the one the viewer shows, else the project's lead part.
  const subject =
    shown !== null
      ? { path: shown.part.path, kind: shown.part.kind }
      : lead === null
        ? null
        : { path: lead.file.path, kind: lead.file.kind };
  // Import beside New, as on Home: files brought into this project's folder.
  const importer = useImportIntoProject(folder, studio?.project.name ?? "the project");
  // The same Import menu as Home's: here Files or a folder copies into this project, and Scan this
  // computer opens the scan, which makes new projects.
  const scanner = useImportActions();
  const importMenu =
    importer === null || scanner === null ? null : (
      <>
        <ImportMenu
          actions={{ scan: scanner.scan, pick: importer.pick }}
          hints={{
            pick: `Copied into ${studio?.project.name ?? "the project"}`,
            scan: "Makes new projects",
          }}
        />
        <ImportDialogHost environmentId={threadRef.environmentId} />
      </>
    );

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
    // A container, so a narrow panel shows Import as its icon.
    <div
      className="@container/toolbar flex min-w-0 flex-1 items-center gap-2"
      data-studio-toolbar=""
    >
      <StudioTour />
      {/* The AI | CAD switch, Import and New close the row, at its right; Home's Your projects ends in Import and New too. */}
      <div className="flex-1" />
      {toggle === "hidden" ? null : (
        <>
          {/* In CAD, the way home: AI is where a part starts, and double-clicking empty space in the view goes there too. */}
          {simpleView ? null : (
            <Button
              variant="outline"
              size="sm"
              disabled={toggle === "held"}
              onClick={() => {
                if (frontViewBusy(useViewerEditState.getState().byView, frontView)) return;
                setSimpleView(true);
              }}
            >
              Back to AI
            </Button>
          )}
          <ModeSwitch
            mode={modeOf(simpleView)}
            held={toggle === "held"}
            onChange={(mode) => {
              // As the store has it at the press: a command opened since holds the layout.
              if (frontViewBusy(useViewerEditState.getState().byView, frontView)) return;
              setSimpleView(simpleOf(mode));
            }}
          />
        </>
      )}
      {importMenu}
      {props.composerRef === null || folder === null || addPart === null ? null : (
        <StudioNew
          environmentId={threadRef.environmentId}
          cwd={folder}
          onCreate={(job) => {
            if (props.composerRef !== null) handToChat(props.composerRef, job.prompt);
            // The job goes to this chat: the Overview steps back beside it, so the work shows.
            useRightPanelStore.getState().setMaximized(threadRef, false);
          }}
          onNewPart={addPart}
        />
      )}
    </div>
  );
}
