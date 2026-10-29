import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useLocation, useParams } from "@tanstack/react-router";
import { ChevronDownIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { isElectron } from "~/env";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { useProject, useThreadShell } from "~/state/entities";
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
import { useAllChats } from "./allChats";
import { ChatRows } from "./ChatRows";
import { useChatScopeStore } from "./chatScope";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { showOverview } from "./overviewPanel";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { StudioFootLinks, StudioHomeLink } from "./StudioNavLinks";
import { studioNavSection } from "./studioNav";
import { useProjectHeading } from "./StudioWorkspaceBar";
import { useOpenChat } from "./useOpenChat";
import { useRememberOpened } from "./useOpenProject";
import { useProjectChats, useProjectRefs } from "./useProjectChats";
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

/** Every project's chats, newest first, each with its project's name, as Claude lists its recents. */
function RecentChats(props: {
  readonly environmentId: EnvironmentId;
  readonly currentId: string | null;
}) {
  const everyChat = useAllChats(props.environmentId);
  const openChat = useOpenFromSidebar();
  return (
    <SidebarGroup aria-label="Recent chats">
      <div className="flex flex-col gap-2">
        <div className="flex h-7 items-center ps-(--sidebar-row-content-inset)">
          <h2 className={headingClass}>Recent chats</h2>
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

/**
 * The open project, inside its workspace, under Home (`StudioHomeLink`): the project (its
 * picture and name, which switch projects, and its own menu); its Overview (everything it holds,
 * its CAD, electronics, analysis and documents beside its chats); New chat; and its chats, newest
 * first, as ChatGPT lists a project's chats, folding away under their heading. Each chat says when
 * it was last worked on, or that it needs the person or is at work; the one open now is marked.
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
  // Chats begun and left unsent for another (New chat over one with text in it), listed first.
  const currentDraftId = useParams({
    strict: false,
    select: (params) => ("draftId" in params ? (params.draftId ?? null) : null),
  });
  const unsent = useUnsentChats(useProjectRefs(environmentId, project), currentDraftId);
  const folded = useChatScopeStore((store) => store.folded);
  const toggleFolded = useChatScopeStore((store) => store.toggleFolded);
  // A new chat has no thread in the address yet; the workspace's own ref covers it too.
  const workspaceRef = useOpenWorkspaceStore((store) => store.workspace?.threadRef ?? null);
  const panelRef = threadRef ?? workspaceRef;
  const overviewOpen = useRightPanelStore(
    (store) => selectActiveRightPanelSurface(store.byThreadKey, panelRef)?.kind === "files",
  );
  const handleNewThread = useNewThreadHandler();
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  const done = () => {
    if (isMobile) setOpenMobile(false);
  };
  const openChat = useOpenFromSidebar();

  return (
    <SidebarGroup aria-label="Project">
      {/* The project's switcher is here while the sidebar shows, else in the top bar (one ⌘O). */}
      {(isMobile ? openMobile : open) ? (
        <div data-tour="project">
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
        {folded ? null : chats.length === 0 && unsent.length === 0 ? (
          <p className={emptyClass}>No chats yet. This one is the first.</p>
        ) : (
          <>
            {unsent.length === 0 ? null : <UnsentChatRows chats={unsent} />}
            {chats.length === 0 ? null : (
              <ChatRows chats={chats} currentId={threadRef?.threadId ?? null} onOpen={openChat} />
            )}
          </>
        )}
      </div>
    </SidebarGroup>
  );
}

/**
 * The column says where the person is: inside a project, that project
 * (`ProjectPanel`); on Studio's pages (Home, Chats, Projects), the recent chats.
 */
function StudioList(props: { readonly environmentId: EnvironmentId }) {
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
  return inWorkspace && folderId !== null ? (
    <ProjectPanel environmentId={environmentId} folderId={folderId} threadRef={threadRef} />
  ) : (
    <RecentChats environmentId={environmentId} currentId={threadRef?.threadId ?? null} />
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
 * The sidebar in the engineering interface (`StudioSidebarFrame`): Home, then where the person is,
 * the open project or the recent chats. With code tools on, the sidebar is T3 Code's own.
 */
export function StudioSidebar() {
  const environmentId = usePrimaryEnvironmentId();
  return (
    <StudioSidebarFrame>
      <SidebarContent className="min-h-full">
        {environmentId === null ? null : <StudioList environmentId={environmentId} />}
      </SidebarContent>
      <SidebarChromeFooter />
    </StudioSidebarFrame>
  );
}
