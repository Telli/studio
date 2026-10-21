import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { useMemo } from "react";

import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { groupProjectFiles } from "./projectFiles";
import { usePictures } from "./usePictures";

/** The kinds of file that can picture a project, in the order one is chosen. */
const COVER_GROUPS = ["CAD", "Electronics", "Drawings", "Analysis"] as const;
const IN_ASSEMBLIES = /(?:^|\/)assembl/i;

/**
 * The file that pictures a project: its first assembly (the whole product), else its first part,
 * else its first board, drawing or study; the file its picture is rendered from (a SolidCraft
 * design's STEP). Null when it has nothing to picture yet.
 */
export function projectCover(paths: ReadonlyArray<string>): string | null {
  const groups = groupProjectFiles(paths);
  const files = COVER_GROUPS.flatMap(
    (group) => groups.find((entry) => entry.group === group)?.files ?? [],
  );
  const cover = files.find((file) => IN_ASSEMBLIES.test(file.folder)) ?? files[0];
  return cover === undefined ? null : (cover.picture ?? cover.path);
}

/** The file that pictures the project's first folder (`projectCover`); null when none does yet. */
function useCoverFile(environmentId: EnvironmentId, project: StudioProject | null) {
  const cwd = project?.folders[0] ?? "";
  const listing = useEnvironmentQuery(
    cwd === "" ? null : projectEnvironment.listEntries({ environmentId, input: { cwd } }),
  );
  const cover = useMemo(
    () =>
      projectCover(
        (listing.data?.entries ?? [])
          .filter((entry) => entry.kind === "file" && entry.ignored !== true)
          .map((entry) => entry.path),
      ),
    [listing.data],
  );
  return { cwd, cover };
}

/** Whether the project has a part, a board or a study yet: what its versions are kept of. */
export function useProjectHasDesign(
  environmentId: EnvironmentId,
  project: StudioProject | null,
): boolean {
  return useCoverFile(environmentId, project).cover !== null;
}

/**
 * A project's picture, as Home's tiles and the project switcher show it (`projectCover`).
 * Undefined while it is made, or for a project with nothing to picture yet.
 */
export function useProjectCover(
  environmentId: EnvironmentId,
  project: StudioProject | null,
): string | undefined {
  const { cwd, cover } = useCoverFile(environmentId, project);
  const pictures = usePictures({ environmentId, cwd, paths: cover === null ? [] : [cover] });
  return cover === null ? undefined : pictures.get(cover);
}
