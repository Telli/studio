import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronDownIcon, HomeIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useNowMinute } from "~/hooks/useNowMinute";
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
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { useAllChats } from "./allChats";
import { ChatRows } from "./ChatRows";
import { useChatScopeStore } from "./chatScope";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { showChat, showOverview } from "./overviewPanel";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { useProjectHeading } from "./StudioWorkspaceBar";
import { useRememberOpened } from "./useOpenProject";
import { useProjectChats } from "./useProjectChats";

const headingClass = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";

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

/**
 * Home, then the project the open chat is in, then the chats: Home first, marked while it shows;
 * the project (its picture and name, which switch projects, and its own menu), its Overview (everything it holds, its CAD,
 * electronics, analysis and documents beside its chats), New chat, then the chats, newest first.
 * Chats are always all to hand: every project's, each with its project's name (`useAllChats`), or
 * this project's alone, as ChatGPT lists a project's chats, as the person last chose
 * (`useChatScopeStore`), and the list folds away under its heading. With no project open (Home),
 * the chats are every project's. Each chat says
 * when it was last worked on, or that it needs the person or is at work; the one open now is
 * marked.
 */
function ProjectSidebar(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const threadRef: ScopedThreadRef | null = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  // Opening a project goes back to the chat last open in it (`useOpenProject`).
  useRememberOpened(threadRef);
  const folderId = useCurrentFolderId(threadRef);
  const project: EnvironmentProject | null = useProject(
    folderId === null ? null : scopeProjectRef(environmentId, folderId),
  );
  const { folder, title } = useProjectHeading(environmentId, project);
  const chats = useProjectChats(environmentId, project);
  const everyChat = useAllChats(environmentId);
  const scope = useChatScopeStore((store) => store.scope);
  const setScope = useChatScopeStore((store) => store.setScope);
  const folded = useChatScopeStore((store) => store.folded);
  const toggleFolded = useChatScopeStore((store) => store.toggleFolded);
  const inProject = folderId !== null;
  const showingAll = !inProject || scope === "all";
  const listed = showingAll ? everyChat.chats : chats;
  // A new chat has no thread in the address yet; the workspace's own ref covers it too.
  const workspaceRef = useOpenWorkspaceStore((store) => store.workspace?.threadRef ?? null);
  const panelRef = threadRef ?? workspaceRef;
  const overviewOpen = useRightPanelStore(
    (store) => selectActiveRightPanelSurface(store.byThreadKey, panelRef)?.kind === "files",
  );
  const navigate = useNavigate();
  const onHome = useLocation({ select: (location) => location.pathname === "/" });
  const handleNewThread = useNewThreadHandler();
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  useNowMinute();
  const done = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup aria-label={inProject ? "Project" : "Chats"}>
      {/* Home first, marked while it shows: Studio's one page of projects, as ⌘K names it. */}
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={onHome}
            aria-current={onHome ? "page" : undefined}
            onClick={() => {
              done();
              if (!onHome) void navigate({ to: "/" });
            }}
          >
            <HomeIcon aria-hidden="true" />
            <span>Home</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      {inProject ? (
        <>
          {/* The project's switcher is here while the sidebar shows, else in the top bar (one ⌘O). */}
          {(isMobile ? openMobile : open) ? (
            <div data-tour="project" className="mt-4">
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
                  if (folderId !== null)
                    void handleNewThread(scopeProjectRef(environmentId, folderId));
                }}
              >
                <PlusIcon aria-hidden="true" />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </>
      ) : null}
      <div className={cn("flex flex-col gap-2", inProject ? "mt-6" : "mt-4")}>
        {/* Chats folds away under its heading, as an Overview module does (`OverviewModules`). */}
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
        {folded ? null : (
          <>
            {inProject ? (
              <div className="ps-(--sidebar-row-content-inset)">
                <ToggleGroup
                  aria-label="Which chats"
                  value={[scope]}
                  onValueChange={(next) => {
                    const value = next[0];
                    if (value === "all" || value === "project") setScope(value);
                  }}
                >
                  <Toggle value="all">All</Toggle>
                  <Toggle value="project">This project</Toggle>
                </ToggleGroup>
              </div>
            ) : null}
            {listed.length === 0 ? (
              <p className="px-(--sidebar-row-content-inset) py-2 text-xs text-muted-foreground">
                {showingAll && !inProject
                  ? "No chats yet. A project's first chat starts with it."
                  : "No chats yet. This one is the first."}
              </p>
            ) : (
              <ChatRows
                chats={listed}
                currentId={threadRef?.threadId ?? null}
                {...(showingAll
                  ? {
                      projectOf: (chat: EnvironmentThreadShell) => everyChat.projectOf.get(chat.id),
                    }
                  : {})}
                onOpen={(chat, current) => {
                  done();
                  // The chat picked shows, the open one too, beside its panel (`showChat`); one
                  // in another project opens that project's workspace.
                  const ref = scopeThreadRef(chat.environmentId, chat.id);
                  showChat(ref);
                  if (current) return;
                  void navigate({
                    to: "/$environmentId/$threadId",
                    params: buildThreadRouteParams(ref),
                  });
                }}
              />
            )}
          </>
        )}
      </div>
    </SidebarGroup>
  );
}

/**
 * The sidebar in the engineering interface: in a project's workspace the project and the chats,
 * on Home every project's chats (`ProjectSidebar`); what a project holds is on its Overview. It
 * folds away from the sidebar's own toggle or its shortcut. With code tools on, the sidebar is T3
 * Code's own.
 */
export function StudioSidebar() {
  const environmentId = usePrimaryEnvironmentId();
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent className="min-h-full">
        {environmentId === null ? null : <ProjectSidebar environmentId={environmentId} />}
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}
