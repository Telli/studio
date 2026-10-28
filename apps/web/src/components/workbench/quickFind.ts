import type { HardwareAction, HardwareActionMenu } from "./hardwareActions";
import { overviewParts } from "./checkResults";
import { classifyProjectFile, type ProjectFile } from "./projectFiles";
import { folderFiles, type ProjectModel } from "./projectModels";

/**
 * What the quick find (`StudioQuickFind`, ⌘K) finds: projects, the parts, documents and chats in
 * them, and every job for the part on screen, the long tail the menus leave to it as well as the
 * everyday ones.
 */

/** Whether the text holds every word typed, ignoring case: "evaluate heat" finds the heat studies. */
export function holdsWords(text: string, query: string): boolean {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "")
    .every((word) => haystack.includes(word));
}

/** A job as the quick find lists it, with where it sits in the menus: "Evaluate · Heat". */
export interface FoundJob {
  readonly action: HardwareAction;
  readonly place: string;
}

/**
 * The jobs of a part's menus (`hardwareActions`) in the menus' order, each section's in full,
 * narrowed to those whose name, section or menu holds every word typed: a menu's name finds all
 * of it. Nothing typed finds none; the quick find opens on parts and projects.
 */
export function findJobs(menus: ReadonlyArray<HardwareActionMenu>, query: string): FoundJob[] {
  if (query.trim() === "") return [];
  return menus.flatMap((menu) =>
    [...menu.sections, ...menu.others].flatMap((section) =>
      section.actions
        .filter((action) => holdsWords(`${action.label}\n${section.title}\n${menu.group}`, query))
        .map((action) => ({ action, place: `${menu.group} · ${section.title}` })),
    ),
  );
}

/** A part in one of a project's folders. */
export interface FoundPart<P> {
  readonly project: P;
  readonly root: string;
  readonly file: ProjectFile;
}

/** The parts in each folder as its project's Overview shows them (`overviewParts`), in order. */
export function folderParts<P>(
  folders: ReadonlyArray<{
    readonly project: P;
    readonly root: string;
    /** Its files, relative to it; null while they are listed. */
    readonly paths: ReadonlyArray<string> | null;
    /** Its cadgen 0.8 models (`folderFiles`). */
    readonly models?: ReadonlyArray<ProjectModel>;
  }>,
): FoundPart<P>[] {
  return folders.flatMap(({ project, root, paths, models }) =>
    overviewParts(folderFiles(paths ?? [], models)).map((file) => ({ project, root, file })),
  );
}

/** The documents in each folder (a PRD, a report, a table), the README left to the Overview. */
export function folderDocuments<P>(
  folders: ReadonlyArray<{
    readonly project: P;
    readonly root: string;
    readonly paths: ReadonlyArray<string> | null;
  }>,
): FoundPart<P>[] {
  return folders.flatMap(({ project, root, paths }) =>
    (paths ?? [])
      .map(classifyProjectFile)
      .filter((file): file is ProjectFile => file !== null)
      .filter((file) => file.group === "Documents" && !/^readme\.md$/i.test(file.path))
      .map((file) => ({ project, root, file })),
  );
}
