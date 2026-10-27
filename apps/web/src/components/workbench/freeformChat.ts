import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";

import { folderProject, useEnvironmentFolders } from "./useProjectFolders";
import { useStudioProjectsList } from "./useStudioProjects";

/**
 * Chats in no project: ones made by Home's old Ask, which no longer exists, run in the folder
 * that holds the Studio projects. They stay listed with every chat, under "No project".
 */
export const NO_PROJECT = "No project";

/** The folder a chat in no project runs in, and its record when the environment knows it. */
export function useNoProjectFolder(environmentId: EnvironmentId) {
  const projectsFolder = useStudioProjectsList(environmentId).data?.folder ?? null;
  const folders = useEnvironmentFolders(environmentId);
  return {
    projectsFolder,
    project: projectsFolder === null ? null : folderProject(folders, projectsFolder),
  };
}

/** The chats in no project, from every chat shell. */
export function noProjectChats(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  environmentId: EnvironmentId,
  projectId: string | null,
): EnvironmentThreadShell[] {
  return projectId === null
    ? []
    : threads.filter(
        (thread) => thread.environmentId === environmentId && thread.projectId === projectId,
      );
}
