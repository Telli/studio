import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { EMPTY_STUDIO_BRIEF, type StudioProjectKind } from "@t3tools/shared/studioProjects";
import { useCallback } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { waitForProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { toastManager } from "../ui/toast";
import { folderProject, useEnvironmentFolders } from "./useProjectFolders";
import { useSaveStudioProject } from "./useStudioProjects";

export interface NewStudioProject {
  readonly environmentId: EnvironmentId;
  readonly name: string;
  readonly kind: StudioProjectKind;
  readonly units: "mm" | "in";
  readonly material: string;
  readonly purpose: string;
  /** Folders the project starts with; none makes a new folder named after it. */
  readonly folders: ReadonlyArray<string>;
  /** Told the project's first folder once it is saved, before its new chat opens (Home's Start). */
  readonly onFolder?: (folder: string) => void;
}

/**
 * Starts a Studio project: a grouping of the chosen folders (or, with none, a
 * new folder T3 makes in its projects folder, with a repository) under one
 * name and brief, saved with the server's settings. Then a new thread opens
 * in its first folder. Resolves to whether it was made.
 */
export function useCreateStudioProject(environmentId: EnvironmentId) {
  const createNew = useAtomCommand(projectEnvironment.createNew, { reportFailure: false });
  const save = useSaveStudioProject(environmentId);
  const knownFolders = useEnvironmentFolders(environmentId);
  const handleNewThread = useNewThreadHandler();

  return useCallback(
    async (input: NewStudioProject): Promise<boolean> => {
      const name = input.name.trim();
      let folders = input.folders;
      let firstProjectId: ProjectId | null =
        folders[0] === undefined ? null : (folderProject(knownFolders, folders[0])?.id ?? null);
      if (folders.length === 0) {
        const created = await createNew({ environmentId: input.environmentId, input: { name } });
        if (created._tag !== "Success") {
          const error = squashAtomCommandFailure(created);
          toastManager.add({
            type: "error",
            title: "Could not create the project",
            description: error instanceof Error ? error.message : "Creating its folder failed.",
          });
          return false;
        }
        folders = [created.value.workspaceRoot];
        firstProjectId = created.value.projectId;
      }
      const id = await save(null, {
        name,
        template: input.kind.id,
        brief: {
          ...EMPTY_STUDIO_BRIEF,
          units: input.units,
          material: input.material.trim(),
          process: input.kind.process,
          purpose: input.purpose.trim(),
        },
        folders,
        createdAt: new Date().toISOString(),
      });
      if (id === null) return false;
      if (folders[0] !== undefined) input.onFolder?.(folders[0]);
      // The project opening is the news; where its folder is stays in Show in Finder.
      toastManager.add({ type: "success", title: `Created ${name}` });

      if (firstProjectId !== null) {
        const projectRef = scopeProjectRef(input.environmentId, firstProjectId);
        const project = await waitForProject(projectRef).catch(() => null);
        if (project !== null) await handleNewThread(projectRef).catch(() => undefined);
      }
      return true;
    },
    [createNew, save, knownFolders, handleNewThread],
  );
}
