import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { leadPartOf } from "./leadPart";
import { useFolderModels } from "./useFolderModels";

/** A project folder's lead part (`leadPartOf`), read again when the agent changes files. */
export function useLeadPart(
  environmentId: EnvironmentId,
  folder: string | null,
  mutationId?: string | null,
) {
  const listing = useEnvironmentQuery(
    folder === null
      ? null
      : projectEnvironment.listEntries({
          environmentId,
          input: { cwd: folder },
        }),
  );
  useWorkspaceMutationRefresh({
    enabled: folder !== null,
    mutationId: mutationId ?? null,
    refresh: listing.refresh,
    resourceKey: `studio-lead-part:${folder ?? ""}`,
  });
  const entries = listing.data?.entries;
  // Its cadgen 0.8 models among its parts, by their document ids.
  const models = useFolderModels(environmentId, folder ?? "", mutationId);
  return useMemo(
    () =>
      folder === null || entries === undefined
        ? null
        : leadPartOf([
            {
              root: folder,
              paths: entries
                .filter((entry) => entry.kind === "file" && entry.ignored !== true)
                .map((entry) => entry.path),
              models,
            },
          ]),
    [entries, folder, models],
  );
}
