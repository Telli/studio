import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { pluginViewsWithEntrypoint } from "@t3tools/client-runtime/state/plugins";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";

import { useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { pluginAppSurface } from "../plugins/pluginSurfaces";
import { isEngineeringInterface } from "./studioInterface";

const OFFERED_STORAGE_KEY = "studio:viewer-offered";
/** Threads remembered as offered their viewer; the oldest are forgotten past this. */
const OFFERED_LIMIT = 2_000;

function readOffered(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(OFFERED_STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
}

/** Marks the thread offered; false when it already was. */
function offerOnce(threadKey: string): boolean {
  const offered = readOffered();
  if (offered.includes(threadKey)) return false;
  try {
    window.localStorage.setItem(
      OFFERED_STORAGE_KEY,
      JSON.stringify([...offered, threadKey].slice(-OFFERED_LIMIT)),
    );
  } catch {
    // Storage is full or off: the viewer is offered again next session, never lost.
  }
  return true;
}

/**
 * In the workbench layout a thread opens on its viewer: the first time a
 * thread shows, the panel opens on the thread view of the first enabled
 * plugin that has one (text-to-cad's CAD tab), so the agent's `cad_show` has
 * a viewer to switch. Each thread is offered it once, remembered apart from
 * the panel's own state (which forgets a thread whose last tab closed), so a
 * viewer the user closed stays closed; the panel's "+" menu brings it back.
 * A thread whose panel already holds something is left as it is.
 */
export function useWorkbenchViewer(input: {
  readonly enabled: boolean;
  readonly environmentId: EnvironmentId;
  /** The server thread; null for a draft, whose plugin servers do not run yet. */
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { enabled, environmentId, threadRef } = input;
  const list = useEnvironmentQuery(
    enabled && threadRef !== null ? pluginEnvironment.list({ environmentId, input: {} }) : null,
  );
  const plugins = list.data?.plugins;

  useEffect(() => {
    if (!enabled || threadRef === null || plugins === undefined) return;
    const choice = pluginViewsWithEntrypoint(plugins, "thread")[0];
    if (choice === undefined) return;
    const threadKey = scopedThreadKey(threadRef);
    if (!offerOnce(threadKey)) return;
    const panels = useRightPanelStore.getState();
    if (threadKey in panels.byThreadKey) return;
    const revision = panels.getUserActionRevision(threadRef);
    // The engineering interface keeps the project page a tab away, the viewer in front.
    if (isEngineeringInterface()) {
      panels.openProactive(threadRef, { id: "files", kind: "files" }, revision);
    }
    panels.openProactive(threadRef, pluginAppSurface(choice), revision);
  }, [enabled, threadRef, plugins]);
}
