import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { studioProjectAt } from "@t3tools/shared/studioProjects";
import { useCallback, useMemo } from "react";

import { useEnvironmentSettings, useUpdateEnvironmentSettings } from "~/hooks/useSettings";
import { randomUUID } from "~/lib/utils";

const NONE: Readonly<Record<string, StudioProject>> = {};

/**
 * Studio's projects on an environment: named groupings of its folders with a
 * brief, kept in the server's settings (`studioProjects`) so every window and
 * device sees the same ones, and the server can hand a thread's agent the
 * project's other folders and brief.
 */
export function useStudioProjects(
  environmentId: EnvironmentId,
): Readonly<Record<string, StudioProject>> {
  return useEnvironmentSettings(environmentId, (settings) => settings.studioProjects ?? NONE);
}

/** The project a folder belongs to, with its id; null when it is in none. */
export function useStudioProjectAt(
  environmentId: EnvironmentId,
  folder: string | null,
): { readonly id: string; readonly project: StudioProject } | null {
  const projects = useStudioProjects(environmentId);
  return useMemo(
    () => (folder === null ? null : studioProjectAt(projects, folder)),
    [projects, folder],
  );
}

/**
 * Saves a project whole under its id, or removes it with null. The change
 * shows at once; T3's settings save reports a failure itself.
 */
export function useSaveStudioProject(environmentId: EnvironmentId) {
  const update = useUpdateEnvironmentSettings(environmentId);
  return useCallback(
    (id: string, project: StudioProject | null) => {
      update({ studioProjects: { [id]: project } });
    },
    [update],
  );
}

export const newStudioProjectId = (): string => randomUUID();
