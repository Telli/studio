import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { waitForProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { toastManager } from "../ui/toast";
import { agentsWithBrief, briefMarkdown, claudeWithBrief } from "./briefFolder";
import {
  PROJECT_FILE,
  type ProjectTemplate,
  agentsWithLayout,
  newProjectBrief,
  studioProjectJson,
} from "./studioProject";

export interface NewStudioProject {
  readonly environmentId: EnvironmentId;
  readonly name: string;
  readonly template: ProjectTemplate;
  readonly units: "mm" | "in";
  readonly material: string;
  readonly purpose: string;
}

/**
 * Starts a Studio project: T3's own new project (a folder in the app's
 * projects folder, a repository and a first commit), then what makes it
 * Studio's: its project file (`studio.json`), its brief for the agent, and an
 * AGENTS.md that says where each kind of work goes and points every agent at
 * the brief. Then a new thread opens in it. Resolves to whether it was made.
 */
export function useCreateStudioProject() {
  const createNew = useAtomCommand(projectEnvironment.createNew, { reportFailure: false });
  const writeFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const handleNewThread = useNewThreadHandler();

  return useCallback(
    async (input: NewStudioProject): Promise<boolean> => {
      const created = await createNew({
        environmentId: input.environmentId,
        input: { name: input.name.trim() },
      });
      if (created._tag !== "Success") {
        const error = squashAtomCommandFailure(created);
        toastManager.add({
          type: "error",
          title: "Could not create the project",
          description: error instanceof Error ? error.message : "Creating the folder failed.",
        });
        return false;
      }
      const { projectId, workspaceRoot } = created.value;
      const brief = newProjectBrief(input);
      const write = (relativePath: string, contents: string) =>
        writeFile({
          environmentId: input.environmentId,
          input: { cwd: workspaceRoot, relativePath, contents },
        });
      const agents = agentsWithBrief(agentsWithLayout(null, input.template));
      await Promise.all([
        write(
          PROJECT_FILE,
          studioProjectJson({ name: input.name.trim(), template: input.template.id, brief }),
        ),
        write("brief/project.md", briefMarkdown(brief, input.name.trim())),
        agents === null ? null : write("AGENTS.md", agents),
        write("CLAUDE.md", claudeWithBrief(null) ?? "@AGENTS.md\n"),
      ]);
      toastManager.add({
        type: "success",
        title: `Created ${input.name.trim()}`,
        description: workspaceRoot,
      });

      const projectRef = scopeProjectRef(input.environmentId, projectId);
      const project = await waitForProject(projectRef).catch(() => null);
      if (project !== null) await handleNewThread(projectRef).catch(() => undefined);
      return true;
    },
    [createNew, writeFile, handleNewThread],
  );
}
