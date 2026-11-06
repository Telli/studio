import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useThreadShells } from "~/state/entities";
import { useOpenedThreads } from "./openedThreads";
import { listProjects } from "./projectList";
import { hiddenByTrash } from "./trash/trash";
import { useEnvironmentFolders } from "./useProjectFolders";
import { useStudioProjectsList } from "./useStudioProjects";

/**
 * The environment's projects with their threads, the one last opened on this
 * device (or worked on) first, and the folders in no project the same way, as the Projects page and
 * the engineering sidebar list them. A folder only projects in Trash hold is left out, with its
 * chats (`hiddenByTrash`). `list` is null while it loads, and nothing is listed until it arrives: a
 * folder is only in no project once the projects are known.
 */
export function useProjectList(environmentId: EnvironmentId) {
  const list = useStudioProjectsList(environmentId).data;
  const knownFolders = useEnvironmentFolders(environmentId);
  const threads = useThreadShells();
  const opened = useOpenedThreads();
  const listed = useMemo(() => {
    if (list === null) return listProjects({}, [], [], environmentId, opened);
    const shown = hiddenByTrash(knownFolders, threads, list.trashed ?? {}, list.projects);
    return listProjects(list.projects, shown.folders, shown.chats, environmentId, opened);
  }, [list, knownFolders, threads, environmentId, opened]);
  return { list, ...listed };
}
