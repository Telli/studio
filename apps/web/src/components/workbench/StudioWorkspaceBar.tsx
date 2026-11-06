import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { MessageSquareIcon } from "lucide-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { KIND_TINT } from "./kinds";
import { ProjectSwitcher } from "./ProjectSwitcher";
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
 * The start of a project workspace's top bar, in the chat's header row: where the person is, the
 * project's switcher (`ProjectSwitcher`, which holds Home too), then the open chat in it. The
 * panel's toolbar carries the rest (`StudioPanelBar`). Short of room the switcher keeps its width
 * and the chat gives way first: its name, then its icon, which wraps out of the one row shown
 * rather than clip. Its name stays on its tooltip.
 */
export function StudioWorkspaceBar(props: {
  readonly environmentId: EnvironmentId;
  readonly project: EnvironmentProject | null;
  /** The open chat's title. */
  readonly chatTitle: string;
}) {
  const { folder, title } = useProjectHeading(props.environmentId, props.project);

  return (
    <nav
      aria-label="Where you are"
      className="flex h-10 min-w-0 flex-1 flex-wrap content-start items-center gap-1 overflow-hidden py-0.5"
    >
      <ProjectSwitcher environmentId={props.environmentId} folder={folder} title={title} />
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-current="page"
              className="flex max-w-fit min-w-6 flex-[1_1_1.5rem] items-center gap-2 overflow-hidden px-1 text-sm font-medium text-foreground"
            />
          }
        >
          <MessageSquareIcon className={`size-4 shrink-0 ${KIND_TINT}`} aria-hidden="true" />
          <span className="truncate">{chatLabel(props.chatTitle)}</span>
        </TooltipTrigger>
        <TooltipPopup side="bottom">{chatLabel(props.chatTitle)}</TooltipPopup>
      </Tooltip>
    </nav>
  );
}
