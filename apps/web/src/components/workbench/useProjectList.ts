import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useThreadShells } from "~/state/entities";
import { useOpenedThreads } from "./openedThreads";
import { listProjects } from "./projectList";
import { useEnvironmentFolders } from "./useProjectFolders";
import { useStudioProjectsList } from "./useStudioProjects";

/**
 * The environment's projects with their threads, the one last opened on this
 * device (or worked on) first, and the folders in no project the same way, as the Projects page and
 * the engineering sidebar list them. `list` is undefined while it loads.
 */
export function useProjectList(environmentId: EnvironmentId) {
  const list = useStudioProjectsList(environmentId).data;
  const knownFolders = useEnvironmentFolders(environmentId);
  const threads = useThreadShells();
  const opened = useOpenedThreads();
  const listed = useMemo(
    () => listProjects(list?.projects ?? {}, knownFolders, threads, environmentId, opened),
    [list, knownFolders, threads, environmentId, opened],
  );
  return { list, ...listed };
}
