import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { useMemo } from "react";

import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { groupFiles, groupProjectFiles, type ProjectFile } from "./projectFiles";
import { folderFiles, pictureVersions, type ProjectModel } from "./projectModels";
import { useFolderModels } from "./useFolderModels";
import { usePictures } from "./usePictures";

/** The kinds of file that can picture a project, in the order one is chosen. */
const COVER_GROUPS = ["CAD", "Electronics", "Drawings", "Analysis"] as const;
const IN_ASSEMBLIES = /(?:^|\/)assembl/i;

/**
 * The file that pictures a project: its first assembly (the whole product), else its first part
 * (a cadgen 0.8 model among them, by its document id), else its first board, drawing or study;
 * the file its picture is rendered from (a SolidCraft design's STEP). Null when it has nothing to
 * picture yet.
 */
export function projectCover(
  paths: ReadonlyArray<string>,
  models: ReadonlyArray<ProjectModel> = [],
): string | null {
  const cover = coverFile(paths, models);
  return cover === null ? null : (cover.picture ?? cover.path);
}

function coverFile(
  paths: ReadonlyArray<string>,
  models: ReadonlyArray<ProjectModel>,
): ProjectFile | null {
  const groups = groupFiles(folderFiles(paths, models));
  const files = COVER_GROUPS.flatMap(
    (group) => groups.find((entry) => entry.group === group)?.files ?? [],
  );
  return (
    files.find((file) => file.kind === "Assembly" || IN_ASSEMBLIES.test(file.folder)) ??
    files[0] ??
    null
  );
}

/**
 * The document that stands for a project with nothing to picture yet, as a page of words: its
 * first document, else its README (what it is). Null when it has neither.
 */
export function projectPage(paths: ReadonlyArray<string>): string | null {
  const documents = groupProjectFiles(paths).find((entry) => entry.group === "Documents")?.files;
  const first = documents?.find((file) => !/^readme\.md$/i.test(file.path)) ?? documents?.[0];
  if (first !== undefined) return first.path;
  return paths.find((path) => /^readme\.md$/i.test(path)) ?? null;
}

/** The file that pictures the project's first folder (`projectCover`); null when none does yet. */
function useCoverFile(environmentId: EnvironmentId, project: StudioProject | null) {
  const cwd = project?.folders[0] ?? "";
  const listing = useEnvironmentQuery(
    cwd === "" ? null : projectEnvironment.listEntries({ environmentId, input: { cwd } }),
  );
  const models = useFolderModels(environmentId, cwd);
  const { cover, page, versions } = useMemo(() => {
    const paths = (listing.data?.entries ?? [])
      .filter((entry) => entry.kind === "file" && entry.ignored !== true)
      .map((entry) => entry.path);
    const file = coverFile(paths, models);
    return {
      cover: file === null ? null : (file.picture ?? file.path),
      page: file === null ? projectPage(paths) : null,
      versions: file === null ? {} : pictureVersions([file]),
    };
  }, [listing.data, models]);
  return { cwd, cover, page, versions };
}

/** The page that stands for a project with nothing to picture (`projectPage`), by its folder. */
export function useProjectPage(
  environmentId: EnvironmentId,
  project: StudioProject | null,
): { readonly root: string; readonly path: string } | null {
  const { cwd, page } = useCoverFile(environmentId, project);
  return page === null ? null : { root: cwd, path: page };
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
  const { cwd, cover, versions } = useCoverFile(environmentId, project);
  const pictures = usePictures({
    environmentId,
    cwd,
    paths: cover === null ? [] : [cover],
    versions,
  });
  return cover === null ? undefined : pictures.get(cover);
}
