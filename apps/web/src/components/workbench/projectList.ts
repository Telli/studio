import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";

/** The folder's project record, by path; null when the environment does not know it. */
export function folderProject(
  folders: ReadonlyArray<EnvironmentProject>,
  folder: string,
): EnvironmentProject | null {
  const key = studioFolderKey(folder);
  return folders.find((project) => studioFolderKey(project.workspaceRoot) === key) ?? null;
}

/** When the threads were last worked on, or `since` when none has been. */
export function newestOf(threads: ReadonlyArray<EnvironmentThreadShell>, since: string): string {
  return threads.reduce(
    (newest, thread) => (thread.updatedAt > newest ? thread.updatedAt : newest),
    since,
  );
}

export interface ListedProject {
  readonly id: string;
  readonly project: StudioProject;
  /** Its first folder's record, where a thread on it starts; null until the folder is known. */
  readonly folder: EnvironmentProject | null;
  /** The records of all its folders that are known. */
  readonly folders: ReadonlyArray<EnvironmentProject>;
  /** The live threads in any of its folders. */
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  /** When it was last worked on. */
  readonly latest: string;
}

export interface ListedFolder {
  readonly folder: EnvironmentProject;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly latest: string;
}

/**
 * Projects with the live threads in their folders, most recently worked on
 * first, then the folders in no project the same way.
 */
export function listProjects(
  projects: Readonly<Record<string, StudioProject>>,
  knownFolders: ReadonlyArray<EnvironmentProject>,
  threads: ReadonlyArray<EnvironmentThreadShell>,
  environmentId: EnvironmentId,
): { readonly cards: ListedProject[]; readonly loose: ListedFolder[] } {
  const live = threads.filter(
    (thread) => thread.archivedAt === null && thread.environmentId === environmentId,
  );
  const threadsIn = (folder: EnvironmentProject | null) =>
    folder === null ? [] : live.filter((thread) => thread.projectId === folder.id);
  const grouped = new Set<string>();
  const cards: ListedProject[] = Object.entries(projects)
    .map(([id, project]) => {
      const folders = project.folders.flatMap((folder) => {
        grouped.add(studioFolderKey(folder));
        const record = folderProject(knownFolders, folder);
        return record === null ? [] : [record];
      });
      const own = folders.flatMap(threadsIn);
      const first = project.folders[0];
      return {
        id,
        project,
        folder: first === undefined ? null : folderProject(knownFolders, first),
        folders,
        threads: own,
        latest: newestOf(own, project.createdAt),
      };
    })
    .toSorted((a, b) => b.latest.localeCompare(a.latest));
  const loose: ListedFolder[] = knownFolders
    .filter((folder) => !grouped.has(studioFolderKey(folder.workspaceRoot)))
    .map((folder) => {
      const own = threadsIn(folder);
      return { folder, threads: own, latest: newestOf(own, folder.createdAt) };
    })
    .toSorted((a, b) => b.latest.localeCompare(a.latest));
  return { cards, loose };
}
