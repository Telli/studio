import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { isElectron } from "~/env";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { useProject, useThreadShell } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { buildThreadRouteParams, resolveThreadRouteRef } from "~/threadRoutes";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { SidebarChromeFooter, SidebarChromeHeader } from "../sidebar/SidebarChrome";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { historyOutcome } from "./projectHistory";
import { useRememberOpened } from "./useOpenProject";
import { useProjectChats } from "./useProjectChats";
import { chatLabel } from "./workspaceTitle";

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

/** How a chat stands, in a word: waiting on the person, at work, else when it was last worked on. */
function standing(chat: EnvironmentThreadShell) {
  const outcome = historyOutcome(chat);
  if (outcome === "needs-you") return { text: "Needs you", tone: "text-warning-foreground" };
  if (outcome === "working") return { text: "Working", tone: "text-foreground" };
  return { text: formatRelativeTimeLabel(chat.updatedAt), tone: "text-muted-foreground" };
}

function ProjectChats(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const threadRef: ScopedThreadRef | null = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  // Opening a project goes back to the chat last open in it (`useOpenProject`).
  useRememberOpened(threadRef);
  const folderId = useCurrentFolderId(threadRef);
  const project = useProject(folderId === null ? null : scopeProjectRef(environmentId, folderId));
  const chats = useProjectChats(environmentId, project);
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const { isMobile, setOpenMobile } = useSidebar();
  useNowMinute();
  const done = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup aria-label="Chats in this project">
      <SidebarMenu>
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
      <div className="mt-2 flex h-7 items-center ps-(--sidebar-row-content-inset)">
        <span className={headingClass}>Chats</span>
      </div>
      {chats.length === 0 ? (
        <p className="px-(--sidebar-row-content-inset) py-2 text-xs text-muted-foreground">
          No chats yet. This one is the first.
        </p>
      ) : (
        <SidebarMenu>
          {chats.map((chat) => {
            const current = chat.id === threadRef?.threadId;
            const state = standing(chat);
            return (
              <SidebarMenuItem key={chat.id}>
                <SidebarMenuButton
                  isActive={current}
                  aria-current={current ? "page" : undefined}
                  onClick={() => {
                    done();
                    if (current) return;
                    void navigate({
                      to: "/$environmentId/$threadId",
                      params: buildThreadRouteParams(scopeThreadRef(chat.environmentId, chat.id)),
                    });
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{chatLabel(chat.title)}</span>
                  <span className={cn("shrink-0 text-2xs font-normal tabular-nums", state.tone)}>
                    {state.text}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}

/**
 * The sidebar in the engineering interface, inside a project's workspace: that project's chats,
 * newest first, as ChatGPT lists a project's chats, with New chat on top. Each says when it was
 * last worked on, or that it needs the person or is at work; the one open now is marked. It folds
 * away from the workspace's top bar (`StudioWorkspaceBar`); on Home it stays shut. With code
 * tools on, the sidebar is T3 Code's own.
 */
export function StudioSidebar() {
  const environmentId = usePrimaryEnvironmentId();
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent className="min-h-full">
        {environmentId === null ? null : <ProjectChats environmentId={environmentId} />}
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}
