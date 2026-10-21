import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { ChevronRightIcon, MessageSquareIcon } from "lucide-react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { resolveThreadRouteRef } from "~/threadRoutes";
import { useSidebar } from "../ui/sidebar";
import { showOverview } from "./overviewPanel";
import { KIND_TINTS } from "./kinds";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { StudioNav } from "./StudioTopBar";
import { useStudioProjectAt } from "./useStudioProjects";
import { chatLabel, workspaceTitle } from "./workspaceTitle";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How a workspace names its project: its folder, its name, and New on its first day. */
export function useProjectHeading(
  environmentId: EnvironmentId,
  project: EnvironmentProject | null,
) {
  const folder = project?.workspaceRoot ?? null;
  const studio = useStudioProjectAt(environmentId, folder);
  const now = Date.parse(`${useNowMinute()}:00Z`);
  const title = workspaceTitle(studio?.project.name ?? project?.title ?? null, folder);
  const isNew = studio !== null && now - Date.parse(studio.project.createdAt) < DAY_MS;
  return { folder, title, isNew };
}

/**
 * The start of a project workspace's top bar, in the chat's header row: where the person is, as a
 * path, the project, then the open chat in it (Google Drive's "My Drive › folder"). While the
 * project shows down the left (`StudioSidebar`, its switcher at the top), the project's name here
 * opens its Overview; folded away (the sidebar's own toggle or its shortcut), the bar leads with
 * Studio's mark (Home) and the project's switcher (`ProjectSwitcher`, marked New on its first
 * day). The panel's toolbar carries the rest (`StudioPanelBar`).
 */
export function StudioWorkspaceBar(props: {
  readonly environmentId: EnvironmentId;
  readonly project: EnvironmentProject | null;
  /** The open chat's title. */
  readonly chatTitle: string;
}) {
  const { folder, title, isNew } = useProjectHeading(props.environmentId, props.project);
  const { isMobile, open } = useSidebar();
  const projectShown = open && !isMobile;
  const routeRef: ScopedThreadRef | null = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  // A new chat has no thread in the address yet; the workspace's own ref covers it too.
  const workspaceRef = useOpenWorkspaceStore((store) => store.workspace?.threadRef ?? null);
  const threadRef = routeRef ?? workspaceRef;

  return (
    <nav aria-label="Where you are" className="flex min-w-0 flex-1 items-center gap-1">
      {projectShown ? (
        <button
          type="button"
          disabled={threadRef === null}
          onClick={() => threadRef !== null && showOverview(threadRef)}
          className="min-w-0 shrink truncate rounded-md px-1.5 py-1 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {title}
        </button>
      ) : (
        <>
          <StudioNav compact />
          <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
          <ProjectSwitcher
            environmentId={props.environmentId}
            folder={folder}
            title={title}
            isNew={isNew}
          />
        </>
      )}
      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      <span
        aria-current="page"
        className="flex min-w-0 items-center gap-2 px-1 text-sm font-medium text-foreground"
      >
        <MessageSquareIcon className={`size-4 shrink-0 ${KIND_TINTS.Chats}`} aria-hidden="true" />
        <span className="truncate">{chatLabel(props.chatTitle)}</span>
      </span>
    </nav>
  );
}
