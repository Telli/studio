import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { MessageSquareIcon } from "lucide-react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { useSidebar } from "../ui/sidebar";
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
 * The start of a project workspace's top bar, in the chat's header row: the open chat, by its
 * name, inside its project. While the project shows down the left (`StudioSidebar`, its name and
 * switcher at the top, folded away by the sidebar's own toggle or its shortcut), the bar names
 * the chat alone; folded, the bar leads with Studio's mark (Home) and the project's name, which
 * switches projects (`ProjectSwitcher`, marked New on its first day). The panel's row carries the
 * rest (`StudioPanelBar`).
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

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {projectShown ? null : (
        <>
          <StudioNav compact />
          <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
          <ProjectSwitcher
            environmentId={props.environmentId}
            folder={folder}
            title={title}
            isNew={isNew}
          />
          <span aria-hidden className="mx-1 shrink-0 text-muted-foreground/60">
            /
          </span>
        </>
      )}
      <span className="flex min-w-0 items-center gap-2 px-1 text-sm font-medium text-foreground">
        <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{chatLabel(props.chatTitle)}</span>
      </span>
    </div>
  );
}
