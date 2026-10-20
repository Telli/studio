import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { useMemo } from "react";

import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { groupProjectFiles } from "./projectFiles";
import { usePictures } from "./usePictures";

/** The file that pictures a project: its first folder's first model, else board or drawing. */
const COVER_GROUPS = ["Models", "Boards and wiring", "Drawings", "Studies"] as const;

/**
 * A project's picture, as Home's tiles and the project switcher show it: a render of its first
 * folder's first part, else its first board, drawing or study. Undefined while it is made, or
 * for a project with nothing to picture yet.
 */
export function useProjectCover(
  environmentId: EnvironmentId,
  project: StudioProject,
): string | undefined {
  const cwd = project.folders[0] ?? "";
  const listing = useEnvironmentQuery(
    cwd === "" ? null : projectEnvironment.listEntries({ environmentId, input: { cwd } }),
  );
  const cover = useMemo(() => {
    const groups = groupProjectFiles(
      (listing.data?.entries ?? [])
        .filter((entry) => entry.kind === "file" && entry.ignored !== true)
        .map((entry) => entry.path),
    );
    return (
      COVER_GROUPS.flatMap((group) => groups.find((entry) => entry.group === group)?.files ?? [])[0]
        ?.path ?? null
    );
  }, [listing.data]);
  const pictures = usePictures({ environmentId, cwd, paths: cover === null ? [] : [cover] });
  return cover === null ? undefined : pictures.get(cover);
}
