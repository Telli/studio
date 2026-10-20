import { overviewParts } from "./checkResults";
import { classifyProjectFile, type ProjectFile } from "./projectFiles";

/** A folder of the project as it was read: its files, or null while they are still listed. */
interface ReadFolder {
  readonly root: string;
  readonly paths: ReadonlyArray<string> | null;
}

/**
 * The project's lead part: the first part of the first folder that has one, in the order the
 * project files them. The Overview shows it large, and Edit by hand opens it.
 */
export function leadPartOf(
  folders: ReadonlyArray<ReadFolder>,
): { readonly root: string; readonly file: ProjectFile } | null {
  for (const folder of folders) {
    const files = (folder.paths ?? [])
      .map(classifyProjectFile)
      .filter((file): file is ProjectFile => file !== null);
    const file = overviewParts(files)[0];
    if (file !== undefined) return { root: folder.root, file };
  }
  return null;
}
