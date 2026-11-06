import { overviewParts } from "./checkResults";
import type { ProjectFile } from "./projectFiles";
import { byLatest, folderFiles, type ProjectModel } from "./projectModels";

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
 * What the Overview's lead picture is, in its kind's word, as the small label beside the part's
 * name: "Latest part". Only a part with a build time can be called the latest.
 */
export function leadKind(file: Pick<ProjectFile, "kind" | "version">): string {
  return file.version === undefined ? file.kind : `Latest ${file.kind.toLowerCase()}`;
}

/**
 * The project's lead part: what was built last (`byLatest`), of the parts not made from another
 * (`sourceParts`), across its folders; with no build times, the first of the first folder that
 * has a part, in the order the project files them. The Overview shows it large, and the workspace
 * opens it.
 */
export function leadPartOf(
  folders: ReadonlyArray<ReadFolder>,
): { readonly root: string; readonly file: ProjectFile } | null {
  let lead: { readonly root: string; readonly file: ProjectFile } | null = null;
  for (const folder of folders) {
    const parts = overviewParts(folderFiles(folder.paths ?? [], folder.models));
    const sources = sourceParts(parts);
    const file = (sources.length > 0 ? sources : parts).toSorted(byLatest)[0];
    if (file !== undefined && (lead === null || byLatest(file, lead.file) < 0)) {
      lead = { root: folder.root, file };
    }
  }
  return lead;
}
