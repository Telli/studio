import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useThreadShellsForProjectRefs } from "~/state/entities";
import { folderProject, useEnvironmentFolders } from "./useProjectFolders";
import { useStudioProjectAt } from "./useStudioProjects";
import { projectChats } from "./workspaceTitle";

/** The projects of every folder of the project a folder belongs to; a folder in no project, its own. */
export function useProjectRefs(environmentId: EnvironmentId, project: EnvironmentProject | null) {
  const folder = project?.workspaceRoot ?? null;
  const studio = useStudioProjectAt(environmentId, folder);
  const knownFolders = useEnvironmentFolders(environmentId);
  return useMemo(() => {
    const records =
      studio === null
        ? project === null
          ? []
          : [project]
        : studio.project.folders.flatMap((path) => folderProject(knownFolders, path) ?? []);
    return records.map((record) => scopeProjectRef(environmentId, record.id));
  }, [studio, project, knownFolders, environmentId]);
}

/**
 * Every chat of the project a folder belongs to, across all its folders, newest first, archived
 * ones left out. A folder in no project has only its own.
 */
export function useProjectChats(
  environmentId: EnvironmentId,
  project: EnvironmentProject | null,
): EnvironmentThreadShell[] {
  return projectChats(useThreadShellsForProjectRefs(useProjectRefs(environmentId, project)));
}
