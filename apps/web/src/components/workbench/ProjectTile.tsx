import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { LayoutDashboardIcon } from "lucide-react";
import { useMemo } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Badge } from "../ui/badge";
import { groupProjectFiles } from "./projectFiles";
import { projectActivity } from "./recentProjects";
import { usePictures } from "./usePictures";

/** The file that pictures a project: its first folder's first model, else board or drawing. */
const COVER_GROUPS = ["Models", "Boards and wiring", "Drawings", "Studies"] as const;

/**
 * A project as Home and Projects show it: a picture of its first part, its name (marked New on
 * its first day), and its latest chat and when.
 */
export function ProjectTile(props: {
  readonly environmentId: EnvironmentId;
  readonly project: StudioProject;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onOpen: () => void;
}) {
  const { environmentId, project } = props;
  const cwd = project.folders[0] ?? "";
  const listing = useEnvironmentQuery(
    cwd === "" ? null : projectEnvironment.listEntries({ environmentId, input: { cwd } }),
  );
  const groups = useMemo(
    () =>
      groupProjectFiles(
        (listing.data?.entries ?? [])
          .filter((entry) => entry.kind === "file" && entry.ignored !== true)
          .map((entry) => entry.path),
      ),
    [listing.data],
  );
  const cover =
    COVER_GROUPS.flatMap((group) => groups.find((entry) => entry.group === group)?.files ?? [])[0]
      ?.path ?? null;
  const pictures = usePictures({ environmentId, cwd, paths: cover === null ? [] : [cover] });
  const picture = cover === null ? undefined : pictures.get(cover);
  // The minute as the page knows it (UTC), so the tile re-reads as time passes.
  const now = Date.parse(`${useNowMinute()}:00Z`);
  const activity = projectActivity({
    createdAt: project.createdAt,
    threads: props.threads,
    now,
    relative: formatRelativeTimeLabel,
  });

  return (
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
  );
}
