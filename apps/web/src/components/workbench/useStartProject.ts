import type { EnvironmentId } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";
import { useCallback } from "react";

import type { NewJob } from "./NewDialog";
import { humanName } from "./partNames";
import { provisionalProjectName, setPendingStart } from "./startProject";
import { useCreateStudioProject } from "./useCreateStudioProject";

/** How Home starts a project: from a description of it, or from New (a part, a board, a PRD). */
export type ProjectStart =
  | {
      readonly kind: "described";
      readonly description: string;
      readonly files: ReadonlyArray<File>;
    }
  | { readonly kind: "new"; readonly job: NewJob };

/** A project started from New is named by what New names: "Bracket", else "New board". */
export function newProjectName(job: Pick<NewJob, "template" | "name">): string {
  const name = job.name.trim();
  if (name !== "" && name !== job.template.defaultName) return humanName(name);
  const label = job.template.label;
  return `New ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

const kindOf = (id: string) => STUDIO_PROJECT_KINDS.find((kind) => kind.id === id)!;

/**
 * Home's Start: makes the project (a new folder with its repository, `useCreateStudioProject`)
 * and opens its first chat, which sends the description, or New's job, as its first message
 * (`usePendingStart`), the way New in a project hands its job to the open chat.
 */
export function useStartProject(environmentId: EnvironmentId) {
  const create = useCreateStudioProject(environmentId);

  return useCallback(
    async (start: ProjectStart): Promise<boolean> => {
      const units = "mm" as const;
      if (start.kind === "described") {
        const description = start.description.trim();
        if (description === "") return false;
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
    [create, environmentId],
  );
}
