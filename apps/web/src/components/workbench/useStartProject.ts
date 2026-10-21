import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";
import { useCallback } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useRightPanelStore } from "~/rightPanelStore";
import type { NewJob } from "./NewDialog";
import { humanName } from "./partNames";
import type { ListedProject } from "./projectList";
import { provisionalProjectName, setPendingStart } from "./startProject";
import { useCreateStudioProject } from "./useCreateStudioProject";

/**
 * How Home starts work: from a description, in a new project or as a new chat in one of yours
 * (`project`), or from New (a part, a board, a PRD) in a new project.
 */
export type ProjectStart =
  | {
      readonly kind: "described";
      readonly description: string;
      readonly files: ReadonlyArray<File>;
      /** The project to start a chat in; null makes a new one. */
      readonly project: ListedProject | null;
    }
  | { readonly kind: "new"; readonly job: NewJob };

/**
 * A project started from New is named by what New names: "Servo bracket", else as new work of its
 * kind, "New board", "New FMEA" (a word in capitals stays as it is).
 */
export function newProjectName(job: Pick<NewJob, "template" | "name">): string {
  const name = job.name.trim();
  if (name !== "" && name !== job.template.defaultName) return humanName(name);
  const label = job.template.label;
  const firstWord = label.split(" ")[0] ?? label;
  const lead =
    firstWord === firstWord.toUpperCase() ? label.charAt(0) : label.charAt(0).toLowerCase();
  return `New ${lead}${label.slice(1)}`;
}

const kindOf = (id: string) => STUDIO_PROJECT_KINDS.find((kind) => kind.id === id)!;

/**
 * Home's Start: makes the project (a new folder with its repository, `useCreateStudioProject`)
 * and opens its first chat, which sends the description, or New's job, as its first message
 * (`usePendingStart`), the way New in a project hands its job to the open chat. With a project of
 * yours chosen, it opens a new chat there instead, which sends the description the same way.
 */
export function useStartProject(environmentId: EnvironmentId) {
  const create = useCreateStudioProject(environmentId);
  const handleNewThread = useNewThreadHandler();

  return useCallback(
    async (start: ProjectStart): Promise<boolean> => {
      const units = "mm" as const;
      if (start.kind === "described") {
        const description = start.description.trim();
        if (description === "") return false;
        const folder = start.project?.folder ?? null;
        if (start.project !== null) {
          if (folder === null) return false;
          setPendingStart(folder.workspaceRoot, { prompt: description, files: start.files });
          const draft = await handleNewThread(scopeProjectRef(folder.environmentId, folder.id));
          // The new chat in front, where its first message shows going out.
          if (draft !== null) {
            const ref = scopeThreadRef(folder.environmentId, draft.threadId);
            useRightPanelStore.getState().setMaximized(ref, false);
          }
          return draft !== null;
        }
        return create({
          environmentId,
          name: provisionalProjectName(description),
          kind: kindOf("part"),
          units,
          material: "",
          purpose: description,
          folders: [],
          onFolder: (folder) =>
            setPendingStart(folder, { prompt: description, files: start.files }),
        });
      }
      const { job } = start;
      return create({
        environmentId,
        name: newProjectName(job),
        kind: kindOf(job.template.id === "board" ? "board" : "part"),
        units: job.units,
        material: "",
        purpose: "",
        folders: [],
        onFolder: (folder) => setPendingStart(folder, { prompt: job.prompt, files: [] }),
      });
    },
    [create, environmentId, handleNewThread],
  );
}
