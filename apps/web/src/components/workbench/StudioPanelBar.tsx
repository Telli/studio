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
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { leadPartOf } from "./leadPart";
import { PartActions } from "./PartActions";
import { useOpenInWorkbench } from "./useOpenInWorkbench";
import { usePartContext } from "./usePartContext";
import { useStudioProjectAt } from "./useStudioProjects";
import { useWorkspaceMode, useWorkspaceModeStore } from "./workspaceMode";

/** What Export offers, each written into the composer as a job for the part on screen. */
const EXPORTS = [
  { label: "STEP", prompt: "Export the part on screen as STEP." },
  { label: "STL and 3MF", prompt: "Export the part on screen as STL and 3MF." },
  {
    label: "Drawing as PDF",
    prompt: "Make an engineering drawing of the part on screen as a PDF.",
  },
  { label: "DXF for cutting", prompt: "Make a cut-ready DXF of the part on screen." },
] as const;

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
 * The rest of a project workspace's top bar, in the panel's title row (the chat's row carries
 * `StudioWorkspaceBar`): Ask or Edit by hand, the part's jobs (Check, Make, Document) and Export.
 * The mode is the project's (`workspaceMode.ts`); the CAD views take it from the host context.
 * Choosing one while no part is in front opens the project's lead part that way; with no part
 * yet, the Overview offers to start one. The jobs are for the part last on screen, else the lead
 * part, led by the project's way of making it.
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
  const open = useOpenInWorkbench(threadRef);
  const partInFront = useRightPanelStore(
    (store) => selectActiveRightPanelSurface(store.byThreadKey, threadRef)?.kind === "plugin-app",
  );
  const shown = usePartContext(threadRef);
  const studio = useStudioProjectAt(threadRef.environmentId, folder);
  const subject =
    shown !== null
      ? { path: shown.part.path, kind: shown.part.kind }
      : lead === null
        ? null
        : { path: lead.file.path, kind: lead.file.kind };

  const exportJob = (prompt: string) => {
    const composer = props.composerRef?.current ?? null;
    if (composer === null) return;
    composer.insertTextAtEnd(prompt, { ensureLeadingBoundary: true });
    composer.focusAtEnd();
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex min-w-0 flex-1 justify-center">
        <ToggleGroup
          aria-label="How to change the part"
          value={[mode]}
          onValueChange={(next) => {
            const value = next[0];
            if (folder === null || (value !== "ask" && value !== "manual")) return;
            setMode(folder, value);
            if (!partInFront && lead !== null) open(lead.file.path);
          }}
        >
          <Toggle value="ask">Ask</Toggle>
          <Toggle value="manual">Edit by hand</Toggle>
        </ToggleGroup>
      </div>
      {subject === null || props.composerRef === null ? null : (
        <PartActions
          environmentId={threadRef.environmentId}
          file={serializeComposerFileLink(subject.path)}
          kind={subject.kind}
          process={studio?.project.brief.process}
          composerRef={props.composerRef}
          inTopBar
        />
      )}
      <Menu>
        <MenuTrigger render={<Button variant="ghost" size="sm" />}>
          <DownloadIcon />
          Export
        </MenuTrigger>
        <MenuPopup align="end" side="bottom" sideOffset={6}>
          {EXPORTS.map((entry) => (
            <MenuItem key={entry.label} onClick={() => exportJob(entry.prompt)}>
              {entry.label}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
      {/* Clear of the panel's own controls, fixed at the title row's end (T3 keeps pr-28 for them). */}
      <span aria-hidden className="w-28 shrink-0" />
    </div>
  );
}
