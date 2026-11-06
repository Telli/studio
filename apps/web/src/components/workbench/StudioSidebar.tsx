import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useLocation, useParams } from "@tanstack/react-router";
import { ChevronRightIcon, EllipsisIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { isElectron } from "~/env";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import { useThreadShell, useThreadShells } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { resolveThreadRouteRef } from "~/threadRoutes";
import { SidebarChromeFooter, SidebarChromeHeader } from "../sidebar/SidebarChrome";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { ChatRows } from "./ChatRows";
import { useChatScopeStore } from "./chatScope";
import { noProjectChats, useNoProjectFolder } from "./freeformChat";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { overviewStanding, showOverview } from "./overviewPanel";
import { useProjectMenu } from "./ProjectMenu";
import type { ListedProject } from "./projectList";
import {
  foldedStanding,
  shownChats,
  type SidebarProject,
  sidebarProjects,
} from "./sidebarProjects";
import { StudioFootLinks, StudioHomeLink } from "./StudioNavLinks";
import { studioNavSection } from "./studioNav";
import { useOpenChat } from "./useOpenChat";
import { useOpenProject, useRememberOpened } from "./useOpenProject";
import { useProjectList } from "./useProjectList";
import { UnsentChatRows, useUnsentChats } from "./UnsentChats";

// A quiet label over a list, as Claude's and Codex's sidebars head their recents.
const headingClass = "text-xs font-medium text-muted-foreground";
const emptyClass = "px-(--sidebar-row-content-inset) py-2 text-xs text-muted-foreground";

/** The folder record the open thread or draft works in. */
function useCurrentFolderId(threadRef: ScopedThreadRef | null): ProjectId | null {
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

/** Opens a chat from the sidebar (`useOpenChat`), shutting a phone's sheet as it goes. */
function useOpenFromSidebar() {
  const { isMobile, setOpenMobile } = useSidebar();
  const openChat = useOpenChat();
  return (chat: EnvironmentThreadShell, current: boolean) => {
    if (isMobile) setOpenMobile(false);
    openChat(chat, current);
  };
}

/**
 * The head of a project's list: Overview (everything it holds) and New chat, in the words of a
 * project's own page. One row is filled at a time: Overview's only when it fills the main pane
 * alone; beside a chat, the chat's row keeps the fill and Overview shows in stronger words.
 */
function ProjectActions(props: {
  readonly entry: SidebarProject;
  /** The panel of the chat open in this project, if one is. */
  readonly panelRef: ScopedThreadRef | null;
  readonly overview: ReturnType<typeof overviewStanding>;
}) {
  const { entry, panelRef, overview } = props;
  const { folder } = entry;
  const handleNewThread = useNewThreadHandler();
  const openProject = useOpenProject();
  const { isMobile, setOpenMobile } = useSidebar();
  const done = () => {
    if (isMobile) setOpenMobile(false);
  };
  if (folder === null) return null;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={overview === "alone"}
          aria-current={overview === "alone" ? "page" : undefined}
          onClick={() => {
            done();
            if (panelRef !== null) showOverview(panelRef);
            else void openProject(folder, entry.threads, showOverview);
          }}
        >
          <LayoutDashboardIcon aria-hidden="true" />
          <span className={cn(overview === "beside" && "text-sidebar-foreground")}>Overview</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => {
            done();
            void handleNewThread(scopeProjectRef(folder.environmentId, folder.id));
          }}
        >
          <PlusIcon aria-hidden="true" />
          <span>New chat</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** An unfolded project's list under its row: Overview, New chat, then its chats, newest first. */
function ProjectChats(props: {
  readonly entry: SidebarProject;
  readonly current: boolean;
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { entry, current, threadRef } = props;
  // A new chat has no thread in the address yet; the workspace's own ref covers it too.
  const workspaceRef = useOpenWorkspaceStore((store) => store.workspace?.threadRef ?? null);
  const panelRef = current ? (threadRef ?? workspaceRef) : null;
  const overview = useRightPanelStore((store) => overviewStanding(store.byThreadKey, panelRef));
  const [all, setAll] = useState(false);
  const currentDraftId = useParams({
    strict: false,
    select: (params) => ("draftId" in params ? (params.draftId ?? null) : null),
  });
  const refs = useMemo(
    () =>
      entry.folder === null
        ? []
        : entry.folderIds.map((id) =>
            scopeProjectRef(entry.folder!.environmentId, id as ProjectId),
          ),
    [entry.folder, entry.folderIds],
  );
  // Chats begun and left unsent for another (New chat over one with text in it), listed first.
  const unsent = useUnsentChats(refs, currentDraftId);
  const openChat = useOpenFromSidebar();
  const currentId = threadRef?.threadId ?? null;
  const { chats, hidden } = shownChats(entry.threads, currentId, all);
  return (
    <div className="flex flex-col ps-4">
      <ProjectActions entry={entry} panelRef={panelRef} overview={overview} />
      {unsent.length === 0 ? null : <UnsentChatRows chats={unsent} />}
      {chats.length === 0 ? null : (
        <ChatRows
          chats={chats}
          currentId={currentId}
          chatShows={overview !== "alone"}
          onOpen={openChat}
        />
      )}
      {hidden > 0 || all ? (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll(!all)}
          className={cn(
            headingClass,
            "h-7 rounded-md ps-8.5 pe-2 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          )}
        >
          {all ? "Show fewer" : `Show ${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}

/**
 * A project down the sidebar: pressed, it folds or unfolds its chats where it stands, as a folder
 * does in Claude's list, and moves the person nowhere: a chat, or Overview, under it does. Folded, it
 * says if a chat in it needs the person or is at work. A right-click, or the "…" on its hover, is the
 * project's menu (`useProjectMenu`).
 */
function ProjectRow(props: {
  readonly entry: SidebarProject;
  readonly current: boolean;
  readonly threadRef: ScopedThreadRef | null;
  readonly onMenu: (card: ListedProject, position: { x: number; y: number }) => void;
}) {
  const { entry, current } = props;
  const unfolded = useChatScopeStore((store) => store.unfolded.includes(entry.id));
  const toggle = useChatScopeStore((store) => store.toggle);
  const standing = unfolded ? null : foldedStanding(entry.threads);
  const { card } = entry;
  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem
          className="group/chat relative"
          {...(current ? { "data-tour": "project" } : {})}
        >
          <SidebarMenuButton
            aria-expanded={unfolded}
            onClick={() => toggle(entry.id)}
            onContextMenu={
              card === null
                ? undefined
                : (event) => {
                    event.preventDefault();
                    props.onMenu(card, { x: event.clientX, y: event.clientY });
                  }
            }
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                "text-muted-foreground transition-transform duration-150",
                unfolded && "rotate-90",
              )}
            />
            <span className={cn("min-w-0 flex-1 truncate", current && "font-medium")}>
              {entry.name}
            </span>
            {standing === null ? null : (
              <span
                className={cn(
                  "shrink-0 text-xs font-normal group-hover/chat:invisible group-focus-within/chat:invisible",
                  standing.tone,
                )}
              >
                {standing.text}
              </span>
            )}
          </SidebarMenuButton>
          {card === null ? null : (
            <button
              type="button"
              aria-label={`More for ${entry.name}`}
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                props.onMenu(card, { x: box.left, y: box.bottom });
              }}
              className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset group-hover/chat:opacity-100"
            >
              <EllipsisIcon className="size-4" aria-hidden="true" />
            </button>
          )}
        </SidebarMenuItem>
      </SidebarMenu>
      {unfolded ? (
        <ProjectChats entry={entry} current={current} threadRef={props.threadRef} />
      ) : null}
    </>
  );
}

/**
 * Every project with its chats nested under it, the same column on every page, as Claude lists
 * folders and their sessions: the person can work in several projects at once and go between their
 * chats without leaving one. The project a chat is open in unfolds when it opens, and marks itself.
 */
function ProjectsList(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const threadRef: ScopedThreadRef | null = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  // Opening a project goes back to the chat last open in it (`useOpenProject`).
  useRememberOpened(threadRef);
  const folderId = useCurrentFolderId(threadRef);
  const inWorkspace = useLocation({
    select: (location) => studioNavSection(location.pathname) === "workspace",
  });
  useNowMinute();
  const { list, cards, loose } = useProjectList(environmentId);
  const free = useNoProjectFolder(environmentId).project;
  const threads = useThreadShells();
  const openProject = useOpenProject();
  const menu = useProjectMenu({
    environmentId,
    cards,
    onOpen: (card) => void openProject(card.folder, card.threads),
  });
  const currentFolderId = inWorkspace ? folderId : null;
  const entries = useMemo(
    () =>
      sidebarProjects({
        cards,
        loose,
        unfiled: noProjectChats(threads, environmentId, free?.id ?? null).filter(
          (thread) => thread.archivedAt === null,
        ),
        freeFolderId: free?.id ?? null,
        currentFolderId,
      }),
    [cards, loose, threads, environmentId, free, currentFolderId],
  );
  const currentId =
    currentFolderId === null
      ? null
      : (entries.find((entry) => entry.folderIds.includes(currentFolderId))?.id ?? null);
  const unfold = useChatScopeStore((store) => store.unfold);
  useEffect(() => {
    if (currentId !== null) unfold(currentId);
  }, [currentId, unfold]);

  return (
    <SidebarGroup aria-label="Projects">
      <div className="flex flex-col gap-1">
        <div className="flex h-7 items-center ps-(--sidebar-row-content-inset)">
          <h2 className={headingClass}>Projects</h2>
        </div>
        {list === null ? null : entries.length === 0 ? (
          <p className={emptyClass}>No projects yet. Start one from Home.</p>
        ) : (
          entries.map((entry) => (
            <ProjectRow
              key={entry.id}
              entry={entry}
              current={entry.id === currentId}
              threadRef={threadRef}
              onMenu={menu.show}
            />
          ))
        )}
      </div>
      {menu.dialogs}
    </SidebarGroup>
  );
}

/**
 * Studio's sidebar, one column: Home at its top (`StudioHomeLink`), then the column the page gives
 * it, and Trash and Settings at its foot. Settings puts its sections there (`AppSidebarLayout`);
 * every other page, where the person is (`StudioSidebar`). It folds away whole from the sidebar's
 * own toggle or its shortcut.
 */
export function StudioSidebarFrame(props: { readonly children: ReactNode }) {
  const environmentId = usePrimaryEnvironmentId();
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      {environmentId === null ? null : (
        <div className="px-2 pt-1 pb-2">
          <StudioHomeLink environmentId={environmentId} />
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{props.children}</div>
      <div className="px-2 pb-2">
        <StudioFootLinks />
      </div>
    </>
  );
}

/**
 * The sidebar in the engineering interface (`StudioSidebarFrame`): Home, then every project with
 * its chats. With code tools on, the sidebar is T3 Code's own.
 */
export function StudioSidebar() {
  const environmentId = usePrimaryEnvironmentId();
  return (
    <StudioSidebarFrame>
      <SidebarContent className="min-h-full">
        {environmentId === null ? null : <ProjectsList environmentId={environmentId} />}
      </SidebarContent>
      <SidebarChromeFooter />
    </StudioSidebarFrame>
  );
}
