import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { newProjectId } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import { waitForProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { setPendingStart } from "./startProject";
import { folderProject, useEnvironmentFolders } from "./useProjectFolders";
import { useStudioProjectsList } from "./useStudioProjects";

/**
 * Chats in no project, from Home's Ask: a question about anything (a part made last week, a file,
 * how something was done), with no project to choose or make first, as Claude Code is asked from
 * wherever it runs. Such a chat runs in the folder that holds the Studio projects, so the agent
 * starts among all of them, and its first message tells it it is in no project and where to look.
 * They are listed with every chat, under "No project".
 */
export const NO_PROJECT = "No project";

/** The first message of a chat in no project: what was asked and attached, then where the agent stands. */
export function askMessage(input: {
  readonly question: string;
  readonly projectsFolder: string;
  /** Files on this computer, named by their paths. */
  readonly paths: ReadonlyArray<string>;
  /** Files sent with the message. */
  readonly attached: number;
}): string {
  const said = input.question.trim();
  const files = input.paths.length + input.attached;
  return [
    said !== ""
      ? said
      : files === 1
        ? "Look at the file I attached."
        : "Look at the files I attached.",
    ...(input.paths.length > 0
      ? ["", "My files:", ...input.paths.map((path) => `- \`${path}\``)]
      : []),
    "",
    `(Asked from Studio's Home, in no project. My Studio projects are the folders in \`${input.projectsFolder}\`, each with its parts, documents and the work of its chats; my other work may be anywhere on this computer. Find what I'm asking about, and say where it is.)`,
  ].join("\n");
}

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

/**
 * Asks in a new chat in no project: the projects' folder made known to the environment the
 * first time, then a chat there that sends the question (`usePendingStart`), opened as a chat
 * alone, its panel coming up when the agent shows something. Resolves to whether it opened.
 */
export function useAskAnything(environmentId: EnvironmentId) {
  const { projectsFolder, project } = useNoProjectFolder(environmentId);
  const create = useAtomCommand(projectEnvironment.create, { reportFailure: true });
  const handleNewThread = useNewThreadHandler();
  return useCallback(
    async (input: {
      readonly question: string;
      readonly paths: ReadonlyArray<string>;
      readonly files: ReadonlyArray<File>;
    }): Promise<boolean> => {
      if (projectsFolder === null) return false;
      let projectId = project?.id ?? null;
      if (projectId === null) {
        const id = newProjectId();
        const made = await create({
          environmentId,
          input: {
            projectId: id,
            title: NO_PROJECT,
            workspaceRoot: projectsFolder,
            createWorkspaceRootIfMissing: true,
            defaultModelSelection: null,
          },
        });
        if (made._tag !== "Success") return false;
        projectId = id;
        await waitForProject(scopeProjectRef(environmentId, id)).catch(() => null);
      }
      setPendingStart(projectsFolder, {
        prompt: askMessage({
          question: input.question,
          projectsFolder,
          paths: input.paths,
          attached: input.files.length,
        }),
        files: [...input.files],
      });
      const draft = await handleNewThread(scopeProjectRef(environmentId, projectId));
      if (draft === null) return false;
      useRightPanelStore.getState().close(scopeThreadRef(environmentId, draft.threadId));
      return true;
    },
    [create, environmentId, handleNewThread, project, projectsFolder],
  );
}
