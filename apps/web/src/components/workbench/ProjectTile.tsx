import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { LayoutDashboardIcon } from "lucide-react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Badge } from "../ui/badge";
import { projectActivity } from "./recentProjects";
import { StarButton } from "./StarButton";
import { useProjectCover } from "./useProjectCover";

/**
 * A project as Home and Projects show it: a picture of its first part, its name (marked New on
 * its first day), and its latest chat and when, with a star over the picture (shown on hover, and
 * always once starred).
 */
export function ProjectTile(props: {
  readonly environmentId: EnvironmentId;
  /** The Studio project's id, which its star is kept by. */
  readonly id: string;
  readonly project: StudioProject;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onOpen: () => void;
}) {
  const { environmentId, project } = props;
  const picture = useProjectCover(environmentId, project);
  // The minute as the page knows it (UTC), so the tile re-reads as time passes.
  const now = Date.parse(`${useNowMinute()}:00Z`);
  const activity = projectActivity({
    createdAt: project.createdAt,
    threads: props.threads,
    now,
    relative: formatRelativeTimeLabel,
  });

  return (
    <div className="group/tile relative flex min-w-0 flex-col">
      <button
        type="button"
        onClick={props.onOpen}
        className="group flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background text-left outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="flex aspect-[4/3] items-center justify-center border-b border-border bg-muted/50">
          {picture ? (
            <img src={picture} alt="" className="size-full object-contain p-3" />
          ) : (
            <LayoutDashboardIcon className="size-8 text-muted-foreground/50" aria-hidden="true" />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
            {activity.isNew ? (
              <Badge variant="info" size="sm">
                New
              </Badge>
            ) : null}
          </span>
          <span className="truncate text-xs text-muted-foreground">{activity.line}</span>
        </span>
      </button>
      <StarButton
        id={props.id}
        name={project.name}
        className="absolute top-1.5 right-1.5 bg-background/85 opacity-0 group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 data-[starred]:opacity-100"
      />
    </div>
  );
}
