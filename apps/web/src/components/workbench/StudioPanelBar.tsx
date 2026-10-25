import type { ScopedThreadRef } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { DownloadIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useImportIntoProject } from "./importIntoProject";
import { leadPartOf } from "./leadPart";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { usePanelTabShortcuts } from "./panelTabShortcuts";
import { PartActions } from "./PartActions";
import { handToChat } from "./NewDialog";
import { surfaceFile } from "./sameFile";
import { setSimpleView, simpleViewToggle, useSimpleView } from "./simpleView";
import { StudioNew } from "./StudioNew";
import { StudioTour } from "./StudioTour";
import { partName } from "./partNames";
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
 * The workspace panel's toolbar, under its tabs (`RightPanelTabs`' toolbar row), one line of what
 * can be done: over a part in the CAD viewer, the part's jobs (Evaluate, Manufacture, with the
 * files to export, and Document), led by the project's way of making it; Simple view where the
 * viewer in front has two layouts (`simpleView.ts`, the person's choice, which every CAD view
 * takes from its host context); and Import and New, always there, at the row's right end
 * (`StudioNew`), where Home has them. ⌘K's jobs are for the part last on screen, else the lead part.
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
  // What is in front decides the row: over the Overview, the project's New; over a part, its jobs
  // and Simple view; over a document, nothing.
  const frontKind = useRightPanelStore(
    (store) => selectActiveRightPanelSurface(store.byThreadKey, threadRef)?.kind ?? null,
  );
  // A view the agent opened names its file only in its id (`surfaceFile`).
  const frontFile = useRightPanelStore((store) => {
    const surface = selectActiveRightPanelSurface(store.byThreadKey, threadRef);
    return surface?.kind === "plugin-app" ? surfaceFile(surface) : null;
  });
  // Simple view, by what the CAD view in front says of its part (`viewerEditState.ts`): shown
  // where it has two layouts, held while a command or sketch is open in it.
  const frontView = useRightPanelStore((store) => {
    const surface = selectActiveRightPanelSurface(store.byThreadKey, threadRef);
    return surface?.kind === "plugin-app" ? pluginViewKey(threadRef, surface.id) : null;
  });
  const simpleView = useSimpleView();
  const toggle = useViewerEditState((store) =>
    simpleViewToggle(frontView === null ? undefined : store.byView[frontView]),
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
  // Import beside New, as on Home: files brought into this project's folder.
  const importer = useImportIntoProject(folder, studio?.project.name ?? "the project");
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
    // A container, so a narrow panel shows the menus as their icons (`PartActions`).
    <div
      className="@container/toolbar flex min-w-0 flex-1 items-center gap-2"
      data-studio-toolbar=""
    >
      <StudioTour />
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
      {/* Simple view, Import and New close the row, at its right; Home's Your projects ends in Import and New too. */}
      <div className="flex-1" />
      {toggle === "hidden" ? null : (
        <Tooltip>
          {/* Hovered through a span: a held toggle takes no pointer of its own, and says why. */}
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <Toggle
              variant="outline"
              size="sm"
              pressed={simpleView}
              disabled={toggle === "held"}
              onPressedChange={(on) => {
                // As the store has it at the press: a command opened since holds the layout.
                if (frontViewBusy(useViewerEditState.getState().byView, frontView)) return;
                setSimpleView(on);
              }}
            >
              Simple view
            </Toggle>
          </TooltipTrigger>
          {toggle === "held" ? (
            <TooltipPopup side="bottom">Finish or cancel the command first</TooltipPopup>
          ) : null}
        </Tooltip>
      )}
      {importer === null ? null : (
        <Button
          variant="outline"
          size="sm"
          aria-label="Import"
          title="Import files or a folder into the project"
          onClick={() => void importer.pick()}
        >
          <DownloadIcon aria-hidden="true" />
          <span className="@max-[40rem]/toolbar:hidden">Import</span>
        </Button>
      )}
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
