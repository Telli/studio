import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { humanName } from "./partNames";
import { type ProjectModel, readFolderModels } from "./projectModels";
import { type CadGet, useEnvironmentCadGet } from "./useVersions";

/**
 * Project folders' cadgen 0.8 models (`readFolderModels`), read through Studio's CAD service as the
 * environment's own CAD server asks it (`GET /__cad/models?root=A&root=B...`), shared by every list
 * that shows a folder: the Overview, Home's tiles, the project switcher, ⌘K and a new chat's
 * starters. The revision moves when an agent changes a project's files, or Studio builds a part
 * (`modelsChanged`); then every folder on screen is read again, all of them in ONE request per
 * environment, and until it lands each keeps the models it had, so nothing blanks while it refreshes.
 */
export function folderModelsStore(schedule: (flush: () => void) => void = queueMicrotask) {
  let revision = 0;
  let version = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    version += 1;
    for (const listener of listeners) listener();
  };
  /** Each folder's last read, by environment and folder: its models, and the revision read at. */
  const read = new Map<
    string,
    { readonly at: number; readonly models: ReadonlyArray<ProjectModel> }
  >();
  /** The folders waiting to be asked, by environment, with the revision and the read to ask with. */
  const waiting = new Map<string, { at: number; get: CadGet; roots: Set<string> }>();
  /** The folders asked at a revision and not answered yet, by environment and folder. */
  const asked = new Map<string, number>();
  const keyOf = (environmentId: EnvironmentId, root: string) => `${environmentId}\n${root}`;

  const flush = (environmentId: EnvironmentId) => {
    const batch = waiting.get(environmentId);
    waiting.delete(environmentId);
    if (batch === undefined || batch.roots.size === 0) return;
    const roots = [...batch.roots];
    const query = roots.map((root) => `root=${encodeURIComponent(root)}`).join("&");
    void batch.get(`/__cad/models?${query}`).then((reply) => {
      const answered =
        typeof reply === "object" && reply !== null && "roots" in reply ? reply.roots : null;
      for (const root of roots) {
        const key = keyOf(environmentId, root);
        if (asked.get(key) === batch.at) asked.delete(key);
        const held = read.get(key);
        // An answer older than one already read changes nothing.
        if (held !== undefined && held.at > batch.at) continue;
        const models =
          typeof answered === "object" && answered !== null && root in answered
            ? readFolderModels({ models: (answered as Record<string, unknown>)[root] })
            : null;
        // A failed read keeps what was known; a first one that failed is empty, at this revision.
        read.set(key, { at: batch.at, models: models ?? held?.models ?? EMPTY });
      }
      notify();
    });
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Moves whenever any folder's models or the revision do: what a hook re-renders on. */
    version: () => version,
    revision: () => revision,
    /** A project's models may have changed (an agent's turn wrote its files, a part was built). */
    changed() {
      revision += 1;
      notify();
    },
    /** A folder's models as last read, kept while a newer read is under way; empty before any. */
    models(environmentId: EnvironmentId, root: string): ReadonlyArray<ProjectModel> {
      return read.get(keyOf(environmentId, root))?.models ?? EMPTY;
    },
    /** Asks for the folders not read at this revision yet, with every other asked for now, in one request. */
    want(environmentId: EnvironmentId, roots: ReadonlyArray<string>, get: CadGet) {
      const at = revision;
      for (const root of roots) {
        const key = keyOf(environmentId, root);
        if ((read.get(key)?.at ?? -1) >= at || (asked.get(key) ?? -1) >= at) continue;
        asked.set(key, at);
        const batch = waiting.get(environmentId);
        if (batch === undefined) {
          waiting.set(environmentId, { at, get, roots: new Set([root]) });
          schedule(() => flush(environmentId));
        } else {
          batch.roots.add(root);
          batch.at = at;
        }
      }
    },
    /** A model's script, absolute in the folder it was read in; undefined for one not read. */
    script(id: string): string | undefined {
      for (const [key, { models }] of read) {
        const model = models.find((entry) => entry.id === id);
        if (model !== undefined)
          return `${key.slice(key.indexOf("\n") + 1).replace(/[\\/]+$/, "")}/${model.script}`;
      }
      return undefined;
    },
    /** What a model read in any folder is called, as the project lists it; undefined for one not read. */
    title(id: string): string | undefined {
      for (const { models } of read.values()) {
        const model = models.find((entry) => entry.id === id);
        if (model !== undefined) return humanName(model.name);
      }
      return undefined;
    },
  };
}

const EMPTY: ReadonlyArray<ProjectModel> = [];
const store = folderModelsStore();

/** A project's models may have changed (an agent's turn wrote its files, a part was built). */
export const modelsChanged = () => store.changed();

/** What a model read in any folder is called, as the project lists it; undefined for one not read. */
export const knownModelTitle = (id: string) => store.title(id);

/** A model's script, absolute, as a folder it was read in holds it; undefined for one not read. */
export const knownModelScript = (id: string) => store.script(id);

/**
 * Each of `folders`' models, by folder: empty until first read, and where the CAD service is off;
 * the last read while a newer one is under way. Pass the thread's `mutationId` where there is one:
 * an agent's change to the files reads them again, for every list.
 */
export function useProjectModels(input: {
  readonly environmentId: EnvironmentId;
  readonly folders: ReadonlyArray<string>;
  readonly mutationId?: string | null | undefined;
}): ReadonlyMap<string, ReadonlyArray<ProjectModel>> {
  const { environmentId } = input;
  const get = useEnvironmentCadGet(environmentId);
  const version = useSyncExternalStore(store.subscribe, store.version);
  const key = input.folders.filter((folder) => folder !== "").join("\n");
  const mutationId = input.mutationId ?? null;
  const seen = useRef(mutationId);
  useEffect(() => {
    if (mutationId === seen.current) return;
    seen.current = mutationId;
    store.changed();
  }, [mutationId]);
  useEffect(() => {
    if (get === null || key === "") return;
    store.want(environmentId, key.split("\n"), get);
  }, [get, environmentId, key, version]);
  return useMemo(
    () =>
      new Map(
        (key === "" ? [] : key.split("\n")).map(
          (root) => [root, store.models(environmentId, root)] as const,
        ),
      ),
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `version` moves as the store reads.
    [environmentId, key, version],
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
