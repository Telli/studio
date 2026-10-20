import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";

import { useNowMinute } from "~/hooks/useNowMinute";
import { Badge } from "../ui/badge";
import { StudioNav } from "./StudioTopBar";
import { useStudioProjectAt } from "./useStudioProjects";
import { workspaceTitle } from "./workspaceTitle";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The start of a project workspace's top bar, in the chat's header row: Studio's nav, then the
 * project's name (marked New on its first day). The panel's row carries the rest (`StudioPanelBar`).
 */
export function StudioWorkspaceBar(props: {
  readonly environmentId: EnvironmentId;
  readonly project: EnvironmentProject | null;
}) {
  const folder = props.project?.workspaceRoot ?? null;
  const studio = useStudioProjectAt(props.environmentId, folder);
  const now = Date.parse(`${useNowMinute()}:00Z`);
  const title = workspaceTitle(studio?.project.name ?? props.project?.title ?? null, folder);
  const isNew = studio !== null && now - Date.parse(studio.project.createdAt) < DAY_MS;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <StudioNav section="workspace" compact />
      <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
      <span className="truncate text-sm font-semibold text-foreground">{title}</span>
      {isNew ? (
        <Badge variant="info" size="sm">
          New
        </Badge>
      ) : null}
    </div>
  );
}
