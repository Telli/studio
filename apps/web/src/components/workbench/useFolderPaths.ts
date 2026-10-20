import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";

import { projectEnvironment } from "~/state/projects";

/** A folder's files, relative to it; null while they are listed. */
export interface FolderPaths {
  readonly root: string;
  readonly paths: ReadonlyArray<string> | null;
}

interface Target {
  readonly environmentId: EnvironmentId;
  readonly folders: ReadonlyArray<string>;
}

// React cannot subscribe to a list of atoms whose length changes, so every folder's listing is
// read inside one derived atom keyed by the folders, as `useProjectChecks` does.
const pathsFamily = Atom.family((key: string) =>
  Atom.make((get): ReadonlyArray<FolderPaths> => {
    const { environmentId, folders } = JSON.parse(key) as Target;
    return folders.map((root) => {
      const listing = projectEnvironment.listEntries({ environmentId, input: { cwd: root } });
      const entries = Option.getOrNull(AsyncResult.value(get(listing)))?.entries;
      return {
        root,
        paths:
          entries === undefined
            ? null
            : entries
                .filter((entry) => entry.kind === "file" && entry.ignored !== true)
                .map((entry) => entry.path),
      };
    });
  }).pipe(Atom.withLabel(`studio:folder-paths:${key}`)),
);

/** The files in each folder, in order, read as the project page reads them. */
export function useFolderPaths(
  environmentId: EnvironmentId,
  folders: ReadonlyArray<string>,
): ReadonlyArray<FolderPaths> {
  return useAtomValue(pathsFamily(JSON.stringify({ environmentId, folders } satisfies Target)));
}
