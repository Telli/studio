import { overviewParts } from "./checkResults";
import { classifyProjectFile, type ProjectFile } from "./projectFiles";
import { type ProjectModel, withModels } from "./projectModels";

/** A folder of the project as it was read: its files, or null while they are still listed, and its models. */
interface ReadFolder {
  readonly root: string;
  readonly paths: ReadonlyArray<string> | null;
  readonly models?: ReadonlyArray<ProjectModel>;
}

/**
 * The project's lead part: the first part of the first folder that has one, in the order the
 * project files them. The Overview shows it large, and the workspace opens it.
 */
export function leadPartOf(
  folders: ReadonlyArray<ReadFolder>,
): { readonly root: string; readonly file: ProjectFile } | null {
  for (const folder of folders) {
    const files = withModels(
      (folder.paths ?? [])
        .map(classifyProjectFile)
        .filter((file): file is ProjectFile => file !== null),
      folder.models,
    );
    const file = overviewParts(files)[0];
    if (file !== undefined) return { root: folder.root, file };
  }
  return null;
}
