import type { EnvironmentId } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";
import { useCallback } from "react";

import { type NewTemplate, newWorkPrompt } from "./newTemplates";
import { provisionalProjectName, setPendingStart } from "./startProject";
import { useCreateStudioProject } from "./useCreateStudioProject";
import { useWorkspaceModeStore } from "./workspaceMode";

/** How Home starts a project: from a description of it, or as a blank part to model by hand. */
export type ProjectStart =
  | {
      readonly kind: "described";
      readonly description: string;
      readonly files: ReadonlyArray<File>;
    }
  | { readonly kind: "blank"; readonly template: NewTemplate };

const kindOf = (id: string) => STUDIO_PROJECT_KINDS.find((kind) => kind.id === id)!;

/**
 * Home's Start: makes the project (a new folder with its repository, `useCreateStudioProject`)
 * and opens its first chat, which sends the description, or the blank work's job, as its first
 * message (`usePendingStart`). Blank parts and assemblies open in Edit by hand.
 */
export function useStartProject(environmentId: EnvironmentId) {
  const create = useCreateStudioProject(environmentId);
  const setMode = useWorkspaceModeStore((store) => store.setMode);

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
      const { template } = start;
      const prompt = newWorkPrompt({
        template,
        name: template.defaultName,
        folder: template.folder,
        units,
        part: null,
        description: "",
      });
      return create({
        environmentId,
        name: `New ${template.label.toLowerCase()}`,
        kind: kindOf(template.id === "board" ? "board" : "part"),
        units,
        material: "",
        purpose: "",
        folders: [],
        onFolder: (folder) => {
          setPendingStart(folder, { prompt, files: [] });
          if (template.id !== "board") setMode(folder, "manual");
        },
      });
    },
    [create, environmentId, setMode],
  );
}
