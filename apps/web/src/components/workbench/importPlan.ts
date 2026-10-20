import type { StudioImportKind } from "@t3tools/shared/studioImport";
import { studioFolderKey } from "@t3tools/shared/studioProjects";

/**
 * What Import proposes from what the desktop app found (`studioImportBridge.ts`): a project for
 * each folder that holds models or drawings, files lying loose to sort, and the files that need a
 * look (copies and older versions). Nothing is moved: a project is its folder where it is.
 */

export interface ImportFile {
  readonly path: string;
  readonly kind: StudioImportKind;
  readonly size: number;
  readonly modifiedMs: number;
}

export interface ScannedRoot {
  readonly root: string;
  readonly files: ReadonlyArray<ImportFile>;
}

export interface ProposedProject {
  readonly folder: string;
  readonly name: string;
  readonly files: ReadonlyArray<ImportFile>;
}

export interface ImportPlan {
  readonly projects: ReadonlyArray<ProposedProject>;
  /** Models and drawings in no proposed project, for Sort to place. */
  readonly loose: ReadonlyArray<ImportFile>;
}

const MAKES_A_PROJECT = new Set<StudioImportKind>(["model", "drawing"]);

const trimSlashes = (path: string) => path.replace(/[\\/]+$/, "");
const segmentsOf = (path: string) => path.split(/[\\/]+/).filter(Boolean);

/** A folder's name in plain words: `sumo-robot` is "Sumo robot". */
export function projectNameFromFolder(folder: string): string {
  const name = (segmentsOf(folder).pop() ?? folder).replace(/[-_]+/g, " ").trim();
  return name === "" ? "Imported project" : name.charAt(0).toUpperCase() + name.slice(1);
}

/** The folder right under the root that holds the file; null for a file lying in the root. */
function folderUnder(root: string, path: string): string | null {
  const base = trimSlashes(root);
  if (!path.startsWith(`${base}/`) && !path.startsWith(`${base}\\`)) return null;
  const rest = segmentsOf(path.slice(base.length));
  return rest.length < 2 ? null : `${base}/${rest[0]}`;
}

/**
 * Proposes projects from scans. By default a scanned root holds projects (Documents, Downloads);
 * with `rootsAreProjects` (folders dropped or picked) each folder is one. Folders Studio already
 * has (`known`, by `studioFolderKey`) are left out.
 */
export function planImport(
  scans: ReadonlyArray<ScannedRoot>,
  known: ReadonlySet<string>,
  options: { readonly rootsAreProjects?: boolean } = {},
): ImportPlan {
  const byFolder = new Map<string, ImportFile[]>();
  const loose: ImportFile[] = [];
  for (const { root, files } of scans) {
    for (const entry of files) {
      const isRootFile = trimSlashes(entry.path) === trimSlashes(root);
      const folder = isRootFile
        ? null
        : options.rootsAreProjects
          ? trimSlashes(root)
          : folderUnder(root, entry.path);
      if (folder === null) {
        if (MAKES_A_PROJECT.has(entry.kind)) loose.push(entry);
        continue;
      }
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), entry]);
    }
  }
  const projects = [...byFolder.entries()]
    .filter(
      ([folder, files]) =>
        !known.has(studioFolderKey(folder)) &&
        files.some((entry) => MAKES_A_PROJECT.has(entry.kind)),
    )
    .map(([folder, files]) => ({ folder, name: projectNameFromFolder(folder), files }));
  return { projects, loose };
}

const fileName = (path: string) => segmentsOf(path).pop() ?? path;
/** A name without its version: `arm v2.step` and `arm_v1.step` are both `arm.step`. */
const unversioned = (name: string) =>
  name
    .toLowerCase()
    .replace(/[\s_-]*(?:v|rev|version)[\s_-]?\d+/g, "")
    .replace(/\s*\(\d+\)/g, "");

/** Copies (same name and size, the newest kept) and older versions of the same file. */
export function needsALook(files: ReadonlyArray<ImportFile>): {
  readonly duplicates: ReadonlyArray<ImportFile>;
  readonly oldVersions: ReadonlyArray<ImportFile>;
} {
  const olderOf = (groups: Map<string, ImportFile[]>) =>
    [...groups.values()].flatMap((group) =>
      group.length < 2 ? [] : group.toSorted((a, b) => b.modifiedMs - a.modifiedMs).slice(1),
    );
  const copies = new Map<string, ImportFile[]>();
  for (const entry of files) {
    const key = `${fileName(entry.path).toLowerCase()}\n${entry.size}`;
    copies.set(key, [...(copies.get(key) ?? []), entry]);
  }
  const duplicates = olderOf(copies);
  const copied = new Set(duplicates.map((entry) => entry.path));
  const versions = new Map<string, ImportFile[]>();
  for (const entry of files) {
    if (copied.has(entry.path)) continue;
    const name = fileName(entry.path);
    const key = unversioned(name);
    if (key === name.toLowerCase()) continue;
    versions.set(key, [...(versions.get(key) ?? []), entry]);
  }
  for (const entry of files) {
    const name = fileName(entry.path).toLowerCase();
    if (!copied.has(entry.path) && versions.has(name)) versions.get(name)!.push(entry);
  }
  return { duplicates, oldVersions: olderOf(versions) };
}

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3),
  );

/** The project a loose file seems to belong to, by a word they share; null when none does. */
export function suggestProject(
  path: string,
  projects: ReadonlyArray<{ readonly name: string }>,
): number | null {
  const fileWords = words(fileName(path).replace(/\.[^.]+$/, ""));
  const index = projects.findIndex((project) =>
    [...words(project.name)].some((word) => fileWords.has(word)),
  );
  return index === -1 ? null : index;
}

const KIND_WORDS: Record<StudioImportKind, readonly [string, string]> = {
  model: ["model", "models"],
  drawing: ["drawing", "drawings"],
  partsList: ["parts list", "parts lists"],
  datasheet: ["datasheet", "datasheets"],
  photo: ["photo", "photos"],
  notes: ["note", "notes"],
};

/** "2 models, 1 parts list, 1 photo": what a set of files holds, by kind. */
export function describeCounts(files: ReadonlyArray<ImportFile>): string {
  const counts = new Map<StudioImportKind, number>();
  for (const entry of files) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  const parts = (Object.keys(KIND_WORDS) as StudioImportKind[]).flatMap((kind) => {
    const count = counts.get(kind) ?? 0;
    return count === 0 ? [] : [`${count} ${KIND_WORDS[kind][count === 1 ? 0 : 1]}`];
  });
  return parts.length === 0 ? "Nothing yet" : parts.join(", ");
}

export function countByKind(files: ReadonlyArray<ImportFile>): Record<StudioImportKind, number> {
  const counts: Record<StudioImportKind, number> = {
    model: 0,
    drawing: 0,
    partsList: 0,
    datasheet: 0,
    photo: 0,
    notes: 0,
  };
  for (const entry of files) counts[entry.kind] += 1;
  return counts;
}

/** Models and drawings changed since a time, outside the folders Studio already has. */
export function freshFiles(
  files: ReadonlyArray<ImportFile>,
  since: number,
  knownKeys: ReadonlyArray<string>,
): ImportFile[] {
  return files.filter((entry) => {
    if (!MAKES_A_PROJECT.has(entry.kind) || entry.modifiedMs <= since) return false;
    const key = studioFolderKey(entry.path);
    return !knownKeys.some((folder) => key === folder || key.startsWith(`${folder}/`));
  });
}

/** Where new files are, in a word: the one scanned folder they are all in, else "your folders". */
export function whereFilesAre(
  roots: ReadonlyArray<string>,
  files: ReadonlyArray<ImportFile>,
): string {
  const root = roots.find((candidate) => {
    const base = trimSlashes(candidate);
    return files.every(
      (entry) => entry.path.startsWith(`${base}/`) || entry.path.startsWith(`${base}\\`),
    );
  });
  return root === undefined ? "your folders" : (segmentsOf(root).pop() ?? root);
}
