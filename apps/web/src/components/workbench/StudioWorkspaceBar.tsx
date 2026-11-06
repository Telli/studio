import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronRightIcon, MessageSquareIcon } from "lucide-react";

import { useSidebar } from "../ui/sidebar";
import { KIND_TINTS } from "./kinds";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { StudioNav } from "./StudioTopBar";
import { useStudioProjectAt } from "./useStudioProjects";
import { chatLabel, workspaceTitle } from "./workspaceTitle";

/** How a workspace names its project: its folder and its name. */
export function useProjectHeading(
  environmentId: EnvironmentId,
  project: EnvironmentProject | null,
) {
  const folder = project?.workspaceRoot ?? null;
  const studio = useStudioProjectAt(environmentId, folder);
  const title = workspaceTitle(studio?.project.name ?? project?.title ?? null, folder);
  return { folder, title };
}

/**
 * The start of a project workspace's top bar, in the chat's header row: where the person is, as a
 * path, the project's switcher (`ProjectSwitcher`), then the open chat in it (Google Drive's "My
 * Drive › folder"). With the sidebar folded away (its own toggle or its shortcut), the bar leads
 * with Studio's mark (Home). The panel's toolbar carries the rest (`StudioPanelBar`).
 */
export function StudioWorkspaceBar(props: {
  readonly environmentId: EnvironmentId;
  readonly project: EnvironmentProject | null;
  /** The open chat's title. */
  readonly chatTitle: string;
}) {
  const { folder, title } = useProjectHeading(props.environmentId, props.project);
  const { isMobile, open } = useSidebar();
  const projectShown = open && !isMobile;

  return (
    <nav aria-label="Where you are" className="flex min-w-0 flex-1 items-center gap-1">
      {projectShown ? null : (
        <>
          <StudioNav compact />
          <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
        </>
      )}
      <ProjectSwitcher environmentId={props.environmentId} folder={folder} title={title} />
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
