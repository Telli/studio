import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { type ProjectModel, readProjectModels } from "./projectModels";
import { useEnvironmentCadGet } from "./useVersions";

/**
 * Each project folder's cadgen 0.8 models (`readProjectModels`), by folder, read from the engine's
 * Recents through Studio's CAD service, and read again whenever the thread's agent changes files
 * (`mutationId`). Empty until read, and where the CAD tools are off.
 */
export function useProjectModels(input: {
  readonly environmentId: EnvironmentId;
  readonly folders: ReadonlyArray<string>;
  readonly mutationId: string | null;
}): ReadonlyMap<string, ReadonlyArray<ProjectModel>> {
  const get = useEnvironmentCadGet(input.environmentId);
  const key = input.folders.join("\n");
  const [read, setRead] = useState<{
    readonly key: string;
    readonly models: ReadonlyMap<string, ReadonlyArray<ProjectModel>>;
  } | null>(null);
  useEffect(() => {
    if (get === null || key === "") return;
    let cancelled = false;
    void get("/__cad/recents").then((recents) => {
      if (cancelled) return;
      const folders = key.split("\n");
      setRead({
        key,
        models: new Map(folders.map((root) => [root, readProjectModels(recents, root)] as const)),
      });
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `mutationId` is the agent changing files: its models may have been built since.
  }, [get, key, input.mutationId]);
  return read !== null && read.key === key ? read.models : EMPTY;
}

const EMPTY: ReadonlyMap<string, ReadonlyArray<ProjectModel>> = new Map();
