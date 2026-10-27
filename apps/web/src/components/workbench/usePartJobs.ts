import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { type HardwareActionMenu, hardwareActions } from "./hardwareActions";

/**
 * The jobs for a part of this kind that the environment's enabled plugins have skills for, by menu
 * (`hardwareActions`), with whether the plugin list is still loading or could not be had, and a
 * retry for when it could not. With no kind (nothing open) there are no jobs.
 */
export function usePartJobs(
  environmentId: EnvironmentId,
  kind: string | null,
  process?: string,
): {
  readonly status: "loading" | "ready" | "failed";
  readonly menus: HardwareActionMenu[];
  readonly retry: () => void;
} {
  const list = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} }));
  const menus = useMemo(() => {
    if (kind === null) return [];
    const skills = new Set(
      (list.data?.plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : [])),
    );
    return hardwareActions(kind, skills, process);
  }, [list.data, kind, process]);
  const status = list.data !== null ? "ready" : list.error !== null ? "failed" : "loading";
  return { status, menus, retry: list.refresh };
}
