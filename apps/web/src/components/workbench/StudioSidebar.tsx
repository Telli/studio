import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { LayoutDashboardIcon, PlusIcon } from "lucide-react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { isElectron } from "~/env";
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
import { ChatRows } from "./ChatRows";
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
 * The project the open chat is in, then what is talked about in it: the project at the top (its
 * picture and name, which switch projects, and its own menu), its Overview (everything it holds,
 * its CAD, electronics, analysis and documents beside its chats), New chat, and its chats, newest
 * first, as ChatGPT lists a project's chats. Each chat says when it was last worked on, or that it
 * needs the person or is at work; the one open now is marked.
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
  const { folder, title, isNew } = useProjectHeading(environmentId, project);
  const chats = useProjectChats(environmentId, project);
  // A new chat has no thread in the address yet; the workspace's own ref covers it too.
  const workspaceRef = useOpenWorkspaceStore((store) => store.workspace?.threadRef ?? null);
  const panelRef = threadRef ?? workspaceRef;
  const overviewOpen = useRightPanelStore(
    (store) => selectActiveRightPanelSurface(store.byThreadKey, panelRef)?.kind === "files",
  );
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  useNowMinute();
  const done = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup aria-label="Project">
      {/* The project's switcher is here while the sidebar shows, else in the top bar (one ⌘O). */}
      {(isMobile ? openMobile : open) ? (
        <div data-tour="project">
          <ProjectSwitcher
            environmentId={environmentId}
            folder={folder}
            title={title}
            isNew={isNew}
            wide
          />
        </div>
      ) : null}
      <SidebarMenu className="mt-2">
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
            disabled={folderId === null}
            onClick={() => {
              done();
              if (folderId !== null) void handleNewThread(scopeProjectRef(environmentId, folderId));
            }}
          >
            <PlusIcon aria-hidden="true" />
            <span>New chat</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <div className="mt-3 flex h-7 items-center ps-(--sidebar-row-content-inset)">
        <span className={headingClass}>Chats</span>
      </div>
      {chats.length === 0 ? (
        <p className="px-(--sidebar-row-content-inset) py-2 text-xs text-muted-foreground">
          No chats yet. This one is the first.
        </p>
      ) : (
        <ChatRows
          chats={chats}
          currentId={threadRef?.threadId ?? null}
          onOpen={(chat, current) => {
            done();
            // The chat picked shows, the open one too, beside its panel (`showChat`).
            const ref = scopeThreadRef(chat.environmentId, chat.id);
            showChat(ref);
            if (current) return;
            void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
          }}
        />
      )}
    </SidebarGroup>
  );
}

/**
 * The sidebar in the engineering interface, inside a project's workspace: the project and its
 * chats (`ProjectSidebar`); what the project holds is on its Overview. It folds away from the
 * sidebar's own toggle or its shortcut; on Home it stays shut. With code tools on, the sidebar is
 * T3 Code's own.
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
