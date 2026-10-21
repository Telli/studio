import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ChevronDownIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { isElectron } from "~/env";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import {
  type RightPanelSurface,
  selectActiveRightPanelSurface,
  useRightPanelStore,
} from "~/rightPanelStore";
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
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { KIND_ICONS } from "./kinds";
import type { Discipline } from "./newTemplates";
import { useNewDialogStore } from "./NewDialog";
import { useFoldedModules } from "./OverviewModules";
import {
  type ContentsItem,
  type ContentsSection,
  projectContents,
  STARTED_SECTIONS,
} from "./projectContents";
import { historyOutcome } from "./projectHistory";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { useProjectHeading } from "./StudioWorkspaceBar";
import { useFolderPaths } from "./useFolderPaths";
import { useOpenChatFile } from "./useOpenInWorkbench";
import { useRememberOpened } from "./useOpenProject";
import { useProjectChats } from "./useProjectChats";
import { useStudioProjectAt } from "./useStudioProjects";
import { chatLabel } from "./workspaceTitle";

/** A section lists this many before "Show all". */
const FIRST = 8;
const FOLDED_KEY = "studio:sidebar-folded";

/** What a section's + starts, and the New dialog's discipline it opens on. */
const STARTS: Readonly<Record<ContentsSection, { label: string; discipline: Discipline } | null>> =
  {
    CAD: { label: "New part", discipline: "CAD" },
    Electronics: { label: "New board", discipline: "Electronics" },
    Analysis: null,
    Manufacturing: null,
    Documents: { label: "New document", discipline: "Documents" },
  };

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

/** The file open beside the thread, as a full path; null for anything else in front. */
function openFileOf(surface: RightPanelSurface | null, folder: string | null): string | null {
  const path =
    surface?.kind === "plugin-app"
      ? surface.file
      : surface?.kind === "file"
        ? surface.relativePath
        : undefined;
  if (path === undefined) return null;
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return path;
  return folder === null ? null : `${folder.replace(/[\\/]+$/, "")}/${path}`;
}

const fullPath = (item: ContentsItem) => `${item.root.replace(/[\\/]+$/, "")}/${item.file.path}`;

/** A section's heading: its name and count, which fold it, and its + where things start in it. */
function SectionHeading(props: {
  readonly title: string;
  readonly count: number;
  readonly folded: boolean;
  readonly onFold: () => void;
  readonly add: { readonly label: string; readonly run: () => void } | null;
}) {
  return (
    <div className="mt-3 flex h-7 items-center justify-between gap-2 ps-(--sidebar-row-content-inset) pe-1">
      <button
        type="button"
        aria-expanded={!props.folded}
        onClick={props.onFold}
        className="flex min-w-0 items-center gap-1.5 rounded-sm text-2xs font-medium tracking-widest text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {props.title}
        {props.count === 0 ? null : (
          <span className="tabular-nums text-muted-foreground/70">{props.count}</span>
        )}
        <ChevronDownIcon
          aria-hidden="true"
          className={cn("size-3 transition-transform duration-150", props.folded && "-rotate-90")}
        />
      </button>
      {props.add === null ? null : (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={props.add.label}
                onClick={props.add.run}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              />
            }
          >
            <PlusIcon className="size-3.5" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipPopup side="right">{props.add.label}</TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
}

/** A section's rows, the first few until Show all. */
function SectionRows(props: { readonly rows: ReadonlyArray<ReactNode>; readonly empty: string }) {
  const [all, setAll] = useState(false);
  if (props.rows.length === 0) {
    return (
      <p className="px-(--sidebar-row-content-inset) py-1 text-xs text-muted-foreground">
        {props.empty}
      </p>
    );
  }
  return (
    <>
      <SidebarMenu>{all ? props.rows : props.rows.slice(0, FIRST)}</SidebarMenu>
      {props.rows.length > FIRST ? (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          className="mt-0.5 self-start ps-(--sidebar-row-content-inset) text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
        >
          {all ? "Show fewer" : `Show all ${props.rows.length}`}
        </button>
      ) : null}
    </>
  );
}

/**
 * The project the open chat is in, and everything in it: the project itself at the top (its
 * picture and name, which switch projects), its Overview, then what lives inside it, by kind:
 * its chats, its CAD, its electronics, the analysis and manufacturing files made from them, and
 * its documents. Each section folds (remembered on this computer) and, where things start, has a
 * + for a new one: a chat, or New on that kind. A row opens beside the chat; the one open now is
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
  const { folder, title, isNew } = useProjectHeading(environmentId, project);
  const studio = useStudioProjectAt(environmentId, folder);
  const folders = useMemo(
    () => studio?.project.folders ?? (folder === null ? [] : [folder]),
    [folder, studio],
  );
  const listing = useFolderPaths(environmentId, folders);
  const sections = useMemo(() => projectContents(listing), [listing]);
  const chats = useProjectChats(environmentId, project);
  const openFile = useOpenChatFile(threadRef);
  const openNow = useRightPanelStore((store) =>
    openFileOf(selectActiveRightPanelSurface(store.byThreadKey, threadRef), folder),
  );
  const overviewOpen = useRightPanelStore(
    (store) => selectActiveRightPanelSurface(store.byThreadKey, threadRef)?.kind === "files",
  );
  const { folded, toggle } = useFoldedModules(folder ?? "", FOLDED_KEY);
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  useNowMinute();
  const done = () => {
    if (isMobile) setOpenMobile(false);
  };
  const showOverview = () => {
    done();
    if (threadRef !== null) useRightPanelStore.getState().open(threadRef, "files");
  };
  const startNew = (discipline: Discipline) => {
    showOverview();
    useNewDialogStore.getState().ask(discipline);
  };
  const newChat = () => {
    done();
    if (folderId !== null) void handleNewThread(scopeProjectRef(environmentId, folderId));
  };

  return (
    <>
      <SidebarGroup aria-label="Project">
        {/* The project's switcher is here while the sidebar shows, else in the top bar (one ⌘O). */}
        {(isMobile ? openMobile : open) ? (
          <ProjectSwitcher
            environmentId={environmentId}
            folder={folder}
            title={title}
            isNew={isNew}
            wide
          />
        ) : null}
        <SidebarMenu className="mt-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={overviewOpen}
              disabled={threadRef === null}
              onClick={showOverview}
            >
              <LayoutDashboardIcon aria-hidden="true" />
              <span>Overview</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup aria-label="Chats">
        <SectionHeading
          title="Chats"
          count={chats.length}
          folded={folded.includes("Chats")}
          onFold={() => toggle("Chats")}
          add={folderId === null ? null : { label: "New chat", run: newChat }}
        />
        {folded.includes("Chats") ? null : (
          <SectionRows
            empty="No chats yet. This one is the first."
            rows={chats.map((chat) => {
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
          />
        )}
      </SidebarGroup>

      {sections.map(({ section, items }) => {
        // Analysis and manufacturing fill as jobs run on the parts; until then they are not shown.
        if (items.length === 0 && !STARTED_SECTIONS.has(section)) return null;
        const start = STARTS[section];
        return (
          <SidebarGroup key={section} aria-label={section}>
            <SectionHeading
              title={section}
              count={items.length}
              folded={folded.includes(section)}
              onFold={() => toggle(section)}
              add={start === null ? null : { ...start, run: () => startNew(start.discipline) }}
            />
            {folded.includes(section) ? null : (
              <SectionRows
                empty="None yet"
                rows={items.map((item) => {
                  const path = fullPath(item);
                  const Icon = KIND_ICONS[item.file.group];
                  return (
                    <SidebarMenuItem key={path}>
                      <SidebarMenuButton
                        isActive={path === openNow}
                        disabled={threadRef === null}
                        onClick={() => {
                          done();
                          openFile(path);
                        }}
                      >
                        <Icon aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              />
            )}
          </SidebarGroup>
        );
      })}
    </>
  );
}

/**
 * The sidebar in the engineering interface, inside a project's workspace: the project, then what
 * lives in it (`ProjectSidebar`). It folds away from the sidebar's own toggle or its shortcut; on
 * Home it stays shut. With code tools on, the sidebar is T3 Code's own.
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
