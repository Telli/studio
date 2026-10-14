import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import type { ProjectBrief } from "./briefFolder";
import {
  LEGACY_BRIEF_FILE,
  PROJECT_FILE,
  parseStudioProject,
  readProjectBrief,
  type StudioProject,
} from "./studioProject";

/** A project's file (`studio.json`) and brief, as the project holds them now. */
export function useProjectBrief(
  environmentId: EnvironmentId,
  cwd: string,
): { readonly project: StudioProject | null; readonly brief: ProjectBrief | null } {
  const projectFile = useEnvironmentQuery(
    projectEnvironment.readFile({ environmentId, input: { cwd, relativePath: PROJECT_FILE } }),
  ).data?.contents;
  const legacyBrief = useEnvironmentQuery(
    projectEnvironment.readFile({ environmentId, input: { cwd, relativePath: LEGACY_BRIEF_FILE } }),
  ).data?.contents;
  return useMemo(
    () => ({
      project: parseStudioProject(projectFile),
      brief: readProjectBrief(projectFile, legacyBrief),
    }),
    [projectFile, legacyBrief],
  );
}
