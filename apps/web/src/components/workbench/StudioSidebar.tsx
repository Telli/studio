import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronLeftIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { isElectron } from "~/env";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { useProject, useThreadShell } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { buildThreadRouteParams, resolveThreadRouteRef } from "~/threadRoutes";
import { SidebarChromeFooter, SidebarChromeHeader } from "../sidebar/SidebarChrome";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { useAllChats } from "./allChats";
import { ChatRows } from "./ChatRows";
import { useChatScopeStore } from "./chatScope";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { showChat, showOverview } from "./overviewPanel";
import { ProjectChoices } from "./ProjectChoices";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { needsYou } from "./recentActivity";
import { StudioRail } from "./StudioRail";
import { listOnPageChange, useStudioPlaceStore } from "./studioPlaces";
import { useProjectHeading } from "./StudioWorkspaceBar";
import { useOpenProject, useRememberOpened } from "./useOpenProject";
import { useProjectChats } from "./useProjectChats";
import { useProjectList } from "./useProjectList";
import { workspaceTitle } from "./workspaceTitle";

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

/** Shuts a phone's sheet once something in it is picked. */
function useDone() {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => {
    if (isMobile) setOpenMobile(false);
  };
}

/** Opens a chat from a list: it shows beside its panel (`showChat`), in its own project. */
function useOpenChat() {
  const navigate = useNavigate();
  const done = useDone();
  return (chat: EnvironmentThreadShell, current: boolean) => {
    done();
    const ref = scopeThreadRef(chat.environmentId, chat.id);
    showChat(ref);
    if (current) return;
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };
}

/** Every project's chats, newest first, each with its project's name (the rail's Chats). */
function ChatsList(props: {
  readonly environmentId: EnvironmentId;
  readonly currentId: string | null;
}) {
  const everyChat = useAllChats(props.environmentId);
  const openChat = useOpenChat();
  return (
    <SidebarGroup aria-label="Chats">
      <div className="flex flex-col gap-2">
        <div className="flex h-7 items-center ps-(--sidebar-row-content-inset)">
          <h2 className={headingClass}>Chats</h2>
        </div>
        {everyChat.chats.length === 0 ? (
          <p className={emptyClass}>No chats yet. A project's first chat starts with it.</p>
        ) : (
          <ChatRows
            chats={everyChat.chats}
            currentId={props.currentId}
            projectOf={(chat) => everyChat.projectOf.get(chat.id)}
            onOpen={openChat}
          />
        )}
      </div>
    </SidebarGroup>
  );
}

/** The chats waiting on the person (a question, an approval), in any project (the rail's Needs you). */
function NeedsList(props: {
  readonly environmentId: EnvironmentId;
  readonly currentId: string | null;
}) {
  const { cards } = useProjectList(props.environmentId);
  const waiting = useMemo(() => {
    const projectOf = new Map<string, string>();
    const chats = needsYou(cards).map(({ card, thread }) => {
      projectOf.set(
        thread.id,
        workspaceTitle(card.project.name, card.folder?.workspaceRoot ?? null),
      );
      return thread;
    });
    return { chats, projectOf };
  }, [cards]);
  const openChat = useOpenChat();
  return (
    <SidebarGroup aria-label="Needs you">
      <div className="flex flex-col gap-2">
        <div className="flex h-7 items-center ps-(--sidebar-row-content-inset)">
          <h2 className={headingClass}>Needs you</h2>
        </div>
        {waiting.chats.length === 0 ? (
          <p className={emptyClass}>Nothing is waiting on you.</p>
        ) : (
          <ChatRows
            chats={waiting.chats}
            currentId={props.currentId}
            projectOf={(chat) => waiting.projectOf.get(chat.id)}
            onOpen={openChat}
          />
        )}
      </div>
    </SidebarGroup>
  );
}

/** Every project, starred first, as the switcher lists them (the rail's Projects). */
function ProjectsList(props: { readonly environmentId: EnvironmentId }) {
  const { cards } = useProjectList(props.environmentId);
  const openProject = useOpenProject();
  const setAllProjects = useStudioPlaceStore((store) => store.setAllProjects);
  const done = useDone();
  const [query, setQuery] = useState("");
  return (
    <SidebarGroup aria-label="Projects">
      <div className="flex flex-col gap-2">
        <div className="flex h-7 items-center ps-(--sidebar-row-content-inset)">
          <h2 className={headingClass}>Projects</h2>
        </div>
        <ProjectChoices
          environmentId={props.environmentId}
          cards={cards}
          query={query}
          onQueryChange={setQuery}
          none="No projects yet. Start one on Home."
          full
          onChoose={(card) => {
            done();
            setAllProjects(false);
            void openProject(card.folder, card.threads);
          }}
        />
      </div>
    </SidebarGroup>
  );
}

/**
 * The open project's page beside the rail (the rail's Projects, inside a project): back to every
 * project; the project (its picture and name, which switch projects, and its own menu); its
 * Overview (everything it holds, its CAD, electronics, analysis and documents beside its chats);
 * New chat; and its chats, newest first, as ChatGPT lists a project's chats, folding away under
 * their heading. Each chat says when it was last worked on, or that it needs the person or is at
 * work; the one open now is marked.
 */
function ProjectPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly folderId: ProjectId;
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { environmentId, folderId, threadRef } = props;
  const project: EnvironmentProject | null = useProject(scopeProjectRef(environmentId, folderId));
  const { folder, title } = useProjectHeading(environmentId, project);
  const chats = useProjectChats(environmentId, project);
  const folded = useChatScopeStore((store) => store.folded);
  const toggleFolded = useChatScopeStore((store) => store.toggleFolded);
  const setAllProjects = useStudioPlaceStore((store) => store.setAllProjects);
  // A new chat has no thread in the address yet; the workspace's own ref covers it too.
  const workspaceRef = useOpenWorkspaceStore((store) => store.workspace?.threadRef ?? null);
  const panelRef = threadRef ?? workspaceRef;
  const overviewOpen = useRightPanelStore(
    (store) => selectActiveRightPanelSurface(store.byThreadKey, panelRef)?.kind === "files",
  );
  const handleNewThread = useNewThreadHandler();
  const { isMobile, open, openMobile } = useSidebar();
  const done = useDone();
  const openChat = useOpenChat();

  return (
    <SidebarGroup aria-label="Project">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="sm" onClick={() => setAllProjects(true)}>
            <ChevronLeftIcon aria-hidden="true" />
            <span>All projects</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      {/* The project's switcher is here while the sidebar shows, else in the top bar (one ⌘O). */}
      {(isMobile ? openMobile : open) ? (
        <div data-tour="project" className="mt-2">
          <ProjectSwitcher environmentId={environmentId} folder={folder} title={title} wide />
        </div>
      ) : null}
      <SidebarMenu className="mt-3">
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={overviewOpen}
            disabled={panelRef === null}
            onClick={() => {
              done();
              if (panelRef !== null) showOverview(panelRef);
            }}
          >
            <LayoutDashboardIcon aria-hidden="true" />
            <span>Overview</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => {
              done();
              void handleNewThread(scopeProjectRef(environmentId, folderId));
            }}
          >
            <PlusIcon aria-hidden="true" />
            <span>New chat</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <div className="mt-6 flex flex-col gap-2">
        {/* The chats fold away under their heading, as an Overview module does (`OverviewModules`). */}
        <div className="flex h-7 items-center ps-(--sidebar-row-content-inset)">
          <button
            type="button"
            aria-expanded={!folded}
            onClick={toggleFolded}
            className={cn(
              headingClass,
              "flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            )}
          >
            Chats
            <ChevronDownIcon
              aria-hidden="true"
              className={cn("size-3 transition-transform duration-150", folded && "-rotate-90")}
            />
          </button>
        </div>
        {folded ? null : chats.length === 0 ? (
          <p className={emptyClass}>No chats yet. This one is the first.</p>
        ) : (
          <ChatRows chats={chats} currentId={threadRef?.threadId ?? null} onOpen={openChat} />
        )}
      </div>
    </SidebarGroup>
  );
}

/** The list beside the rail: the one the rail picked (`useStudioPlaceStore`). */
function StudioList(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const threadRef: ScopedThreadRef | null = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  // Opening a project goes back to the chat last open in it (`useOpenProject`).
  useRememberOpened(threadRef);
  const folderId = useCurrentFolderId(threadRef);
  const list = useStudioPlaceStore((store) => store.list);
  const allProjects = useStudioPlaceStore((store) => store.allProjects);
  useNowMinute();
  const currentId = threadRef?.threadId ?? null;

  if (list === "chats") return <ChatsList environmentId={environmentId} currentId={currentId} />;
  if (list === "needs") return <NeedsList environmentId={environmentId} currentId={currentId} />;
  return folderId === null || allProjects ? (
    <ProjectsList environmentId={environmentId} />
  ) : (
    <ProjectPanel environmentId={environmentId} folderId={folderId} threadRef={threadRef} />
  );
}

/**
 * Home shows on its own beside the rail: arriving folds the list away, and leaving brings it back
 * as it was (`listOnPageChange`). On a phone the sidebar is a sheet, opened only on purpose.
 */
function useHomeShowsOnItsOwn() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { isMobile, open, setOpen } = useSidebar();
  const previous = useRef<string | null>(null);
  const openBeforeHome = useRef<boolean | null>(null);
  useEffect(() => {
    if (previous.current === pathname) return;
    const wasHome = previous.current === "/";
    previous.current = pathname;
    if (isMobile) return;
    const next = listOnPageChange({
      wasHome,
      isHome: pathname === "/",
      open,
      openBeforeHome: openBeforeHome.current,
    });
    openBeforeHome.current = next.openBeforeHome;
    if (next.open !== open) void setOpen(next.open);
  }, [pathname, isMobile, open, setOpen]);
}

/**
 * The sidebar in the engineering interface: Studio's rail of places down the far left
 * (`StudioRail`), and beside it the list the rail picked: every chat, the projects (the open one's
 * own page inside a project), or what is waiting on the person. The list folds away from the
 * sidebar's own toggle or its shortcut, and the rail stays. With code tools on, the sidebar is T3
 * Code's own.
 */
export function StudioSidebar() {
  const environmentId = usePrimaryEnvironmentId();
  useHomeShowsOnItsOwn();
  return (
    <>
      {/* Folded to the rail, the header keeps the window's controls and clips the name. */}
      <div className="min-w-0 overflow-hidden">
        <SidebarChromeHeader isElectron={isElectron} />
      </div>
      <div className="flex min-h-0 flex-1">
        {environmentId === null ? null : <StudioRail environmentId={environmentId} />}
        <div className="flex min-w-0 flex-1 flex-col border-s border-sidebar-border group-data-[collapsible=icon]:hidden">
          <SidebarContent className="min-h-full">
            {environmentId === null ? null : <StudioList environmentId={environmentId} />}
          </SidebarContent>
          <SidebarChromeFooter />
        </div>
      </div>
    </>
  );
}
