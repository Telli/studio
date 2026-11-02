import { overviewParts } from "./checkResults";
import type { ProjectFile } from "./projectFiles";
import { folderFiles, type ProjectModel } from "./projectModels";

/** A folder of the project as it was read: its files, or null while they are still listed, and its models. */
interface ReadFolder {
  readonly root: string;
  readonly paths: ReadonlyArray<string> | null;
  readonly models?: ReadonlyArray<ProjectModel>;
}

const stem = (file: ProjectFile) => file.name.replace(/\..*$/, "").toLowerCase();

/**
 * The parts not named after another of `parts`: `bracket_flat` and `bracket-v2` are made from
 * `bracket`, which stands for them, whichever a listing in name order puts first.
 */
export function sourceParts(parts: ReadonlyArray<ProjectFile>): ProjectFile[] {
  const stems = parts.map(stem);
  const made = (name: string) =>
    stems.some(
      (other) =>
        other !== name && name.startsWith(other) && /^[-_. ]/.test(name.slice(other.length)),
    );
  return parts.filter((part) => !made(stem(part)));
}

/**
 * The project's lead part: the first part of the first folder that has one, in the order the
 * project files them, of those not made from another (`sourceParts`). The Overview shows it
 * large, and the workspace opens it.
 */
export function leadPartOf(
  folders: ReadonlyArray<ReadFolder>,
): { readonly root: string; readonly file: ProjectFile } | null {
  for (const folder of folders) {
    const parts = overviewParts(folderFiles(folder.paths ?? [], folder.models));
    const file = sourceParts(parts)[0] ?? parts[0];
    if (file !== undefined) return { root: folder.root, file };
  }
  return null;
}
