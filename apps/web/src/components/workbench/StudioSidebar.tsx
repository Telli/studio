import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { FolderIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { isElectron } from "~/env";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { useThreadShell } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { resolveThreadRouteRef } from "~/threadRoutes";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { SidebarChromeFooter, SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { Button } from "../ui/button";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { NewProjectDialog } from "./NewProjectDialog";
import { historyOutcome } from "./projectHistory";
import { useOpenProject, useRememberOpened } from "./useOpenProject";
import { useProjectList } from "./useProjectList";

const headingClass = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";

/** The folder record the open thread or draft works in, to mark its project. */
function useCurrentFolderId(threadRef: ScopedThreadRef | null): string | null {
  const draftId = useParams({
    strict: false,
    select: (params) => (params as { readonly draftId?: string }).draftId ?? null,
  });
  const thread = useThreadShell(threadRef);
  const draftProjectId = useComposerDraftStore((store) =>
    draftId === null ? null : (store.getDraftSession(draftId as DraftId)?.projectId ?? null),
  );
  return thread?.projectId ?? draftProjectId;
}

/** How a project stands, in a word: waiting on the person, at work, else when it was last worked on. */
function standing(threads: ReadonlyArray<EnvironmentThreadShell>, latest: string) {
  const outcomes = new Set(threads.map(historyOutcome));
  if (outcomes.has("needs-you")) return { text: "Needs you", tone: "text-warning-foreground" };
  if (outcomes.has("working")) return { text: "Working", tone: "text-foreground" };
  return { text: formatRelativeTimeLabel(latest), tone: "text-muted-foreground" };
}

function ProjectRow(props: {
  readonly name: string;
  readonly kind: "project" | "folder";
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly latest: string;
  readonly current: boolean;
  readonly onOpen: () => void;
}) {
  const state = standing(props.threads, props.latest);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={props.current}
        aria-current={props.current ? "page" : undefined}
        onClick={props.onOpen}
      >
        {props.kind === "project" ? (
          <LayoutDashboardIcon aria-hidden="true" />
        ) : (
          <FolderIcon aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate">{props.name}</span>
        <span className={cn("shrink-0 text-2xs font-normal tabular-nums", state.tone)}>
          {state.text}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function Projects(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const { list, cards, loose } = useProjectList(environmentId);
  const openProject = useOpenProject();
  const { isMobile, setOpenMobile } = useSidebar();
  const threadRef: ScopedThreadRef | null = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  useRememberOpened(threadRef);
  const currentFolderId = useCurrentFolderId(threadRef);
  const [dialog, setDialog] = useState({ count: 0, open: false });
  useNowMinute();

  const open = (
    folder: EnvironmentProject | null,
    threads: ReadonlyArray<EnvironmentThreadShell>,
  ) => {
    if (isMobile) setOpenMobile(false);
    void openProject(folder, threads);
  };
  const currentProjectId = useMemo(
    () =>
      cards.find((card) => card.folders.some((folder) => folder.id === currentFolderId))?.id ??
      null,
    [cards, currentFolderId],
  );

  return (
    <>
      <SidebarGroup aria-label="Projects">
        <div className="flex h-7 items-center justify-between ps-(--sidebar-row-content-inset)">
          <span className={headingClass}>Projects</span>
          <Button
            variant="ghost-muted"
            size="icon-xs"
            aria-label="New project"
            onClick={() => setDialog((current) => ({ count: current.count + 1, open: true }))}
          >
            <PlusIcon />
          </Button>
        </div>
        {cards.length === 0 ? (
          <p className="px-(--sidebar-row-content-inset) py-2 text-xs text-muted-foreground">
            {list === undefined
              ? "Reading your projects"
              : "No projects yet. Start one with New project."}
          </p>
        ) : (
          <SidebarMenu>
            {cards.map((card) => (
              <ProjectRow
                key={card.id}
                name={card.project.name}
                kind="project"
                threads={card.threads}
                latest={card.latest}
                current={card.id === currentProjectId}
                onOpen={() => open(card.folder, card.threads)}
              />
            ))}
          </SidebarMenu>
        )}
      </SidebarGroup>
      {loose.length === 0 ? null : (
        <SidebarGroup aria-label="Folders in no project">
          <div className="flex h-7 items-center ps-(--sidebar-row-content-inset)">
            <span className={headingClass}>Folders</span>
          </div>
          <SidebarMenu>
            {loose.map(({ folder, threads, latest }) => (
              <ProjectRow
                key={folder.id}
                name={folder.title}
                kind="folder"
                threads={threads}
                latest={latest}
                current={currentProjectId === null && folder.id === currentFolderId}
                onOpen={() => open(folder, threads)}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
      <NewProjectDialog
        key={dialog.count}
        open={dialog.open}
        onOpenChange={(next) => setDialog((current) => ({ ...current, open: next }))}
        environmentId={environmentId}
      />
    </>
  );
}

/**
 * The sidebar in the engineering interface: the projects, not their
 * threads. Each opens on its page, where its history is (`ProjectThreads`), in
 * the thread last open in it (`useOpenProject`);
 * one with work waiting on the person says so, one at work says so, else when
 * it was last worked on, and the one open now is marked. Folders in no project
 * follow, each a project of its own. T3 Code's header and footer stay; with
 * code tools on, the sidebar is T3 Code's own.
 */
export function StudioSidebar() {
  const environmentId = usePrimaryEnvironmentId();
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent className="min-h-full">
        {environmentId === null ? null : <Projects environmentId={environmentId} />}
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}
