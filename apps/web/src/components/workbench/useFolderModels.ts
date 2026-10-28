import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { sharedLoad } from "./partContext";
import { humanName } from "./partNames";
import { type ProjectModel, readFolderModels } from "./projectModels";
import { type CadGet, useEnvironmentCadGet } from "./useVersions";

/**
 * Project folders' cadgen 0.8 models (`readFolderModels`), read through Studio's CAD service as the
 * environment's own CAD server asks it (`GET /__cad/models?root=`), one read per environment, folder
 * and revision shared by every list that shows the folder: the Overview, Home's tiles, the project
 * switcher, ⌘K and a new chat's starters. The revision moves when an agent changes a project's
 * files, or Studio builds a part (`modelsChanged`), and every folder is read again then.
 */

let revision = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const currentRevision = () => revision;

/** A project's models may have changed (an agent's turn wrote its files, a part was built). */
export function modelsChanged() {
  revision += 1;
  for (const listener of listeners) listener();
}

const IN_FLIGHT = new Map<string, Promise<ReadonlyArray<ProjectModel>>>();
const READ = new Map<string, ReadonlyArray<ProjectModel>>();
const keyOf = (environmentId: EnvironmentId, root: string, at: number) =>
  [environmentId, root, at].join("\n");

function readFolder(get: CadGet, environmentId: EnvironmentId, root: string, at: number) {
  const key = keyOf(environmentId, root, at);
  return sharedLoad(IN_FLIGHT, key, async () => {
    const models = readFolderModels(await get(`/__cad/models?root=${encodeURIComponent(root)}`));
    // A folder's earlier revisions are read no more.
    for (const kept of READ.keys()) {
      if (kept.startsWith(`${environmentId}\n${root}\n`)) READ.delete(kept);
    }
    READ.set(key, models);
    return models;
  });
}

const EMPTY: ReadonlyArray<ProjectModel> = [];

/** What a model read in any folder is called, as the project lists it; undefined for one not read. */
export function knownModelTitle(id: string): string | undefined {
  for (const models of READ.values()) {
    const model = models.find((entry) => entry.id === id);
    if (model !== undefined) return humanName(model.name);
  }
  return undefined;
}

/**
 * Each of `folders`' models, by folder: empty until read, and where the CAD tools are off. Pass the
 * thread's `mutationId` where there is one: an agent's change to the files reads them again, for
 * every list.
 */
export function useProjectModels(input: {
  readonly environmentId: EnvironmentId;
  readonly folders: ReadonlyArray<string>;
  readonly mutationId?: string | null | undefined;
}): ReadonlyMap<string, ReadonlyArray<ProjectModel>> {
  const { environmentId } = input;
  const get = useEnvironmentCadGet(environmentId);
  const at = useSyncExternalStore(subscribe, currentRevision);
  const key = input.folders.filter((folder) => folder !== "").join("\n");
  const [loaded, setLoaded] = useState(0);
  const mutationId = input.mutationId ?? null;
  const seen = useRef(mutationId);
  useEffect(() => {
    if (mutationId === seen.current) return;
    seen.current = mutationId;
    modelsChanged();
  }, [mutationId]);
  useEffect(() => {
    if (get === null || key === "") return;
    let cancelled = false;
    const missing = key.split("\n").filter((root) => !READ.has(keyOf(environmentId, root, at)));
    if (missing.length === 0) return;
    void Promise.all(missing.map((root) => readFolder(get, environmentId, root, at))).then(() => {
      if (!cancelled) setLoaded((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [get, environmentId, key, at]);
  return useMemo(
    () =>
      new Map(
        (key === "" ? [] : key.split("\n")).map(
          (root) => [root, READ.get(keyOf(environmentId, root, at)) ?? EMPTY] as const,
        ),
      ),
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `loaded` moves as `READ` fills.
    [environmentId, key, at, loaded],
  );
}

/** One folder's models (`useProjectModels`). */
export function useFolderModels(
  environmentId: EnvironmentId,
  root: string,
  mutationId?: string | null,
): ReadonlyArray<ProjectModel> {
  const folders = useMemo(() => (root === "" ? [] : [root]), [root]);
  return useProjectModels({ environmentId, folders, mutationId }).get(root) ?? EMPTY;
}
