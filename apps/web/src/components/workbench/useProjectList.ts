import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useThreadShells } from "~/state/entities";
import { listProjects } from "./projectList";
import { useEnvironmentFolders } from "./useProjectFolders";
import { useStudioProjectsList } from "./useStudioProjects";

/**
 * The environment's projects with their threads, most recently worked on
 * first, and the folders in no project the same way, as the Projects page and
 * the engineering sidebar list them. `list` is undefined while it loads.
 */
export function useProjectList(environmentId: EnvironmentId) {
  const list = useStudioProjectsList(environmentId).data;
  const knownFolders = useEnvironmentFolders(environmentId);
  const threads = useThreadShells();
  const listed = useMemo(
    () => listProjects(list?.projects ?? {}, knownFolders, threads, environmentId),
    [list, knownFolders, threads, environmentId],
  );
  return { list, ...listed };
}
