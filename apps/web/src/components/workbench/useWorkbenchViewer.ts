import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { pluginViewsWithEntrypoint } from "@t3tools/client-runtime/state/plugins";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
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
 * In the workbench layout a thread opens on its project and its viewer. Every
 * thread, a new one included, is offered the project page once in the
 * engineering interface (the pinned Project tab); a thread the agent works in
 * is offered the thread view of the first enabled plugin that has one (text-to-
 * cad's CAD tab), in front, so the agent's `cad_show` has a viewer to switch.
 * Each offer is made once per thread, remembered apart from the panel's own
 * state (which forgets a thread whose last tab closed), so what the user
 * closed stays closed; the panel's "+" menu brings it back.
 */
export function useWorkbenchViewer(input: {
  readonly enabled: boolean;
  readonly environmentId: EnvironmentId;
  /** The thread, a draft included. */
  readonly threadRef: ScopedThreadRef | null;
  /** Whether the thread has started: a draft's plugin servers do not run yet. */
  readonly serverThread: boolean;
}) {
  const { enabled, environmentId, threadRef, serverThread } = input;
  const list = useEnvironmentQuery(
    enabled && serverThread && threadRef !== null
      ? pluginEnvironment.list({ environmentId, input: {} })
      : null,
  );
  const plugins = list.data?.plugins;

  useEffect(() => {
    if (!enabled || threadRef === null) return;
    const threadKey = scopedThreadKey(threadRef);
    const surfaces = () =>
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef).surfaces;
    if (isEngineeringInterface() && offerOnce(`project:${threadKey}`)) {
      const panels = useRightPanelStore.getState();
      if (!surfaces().some((surface) => surface.kind === "files")) {
        panels.openProactive(
          threadRef,
          { id: "files", kind: "files" },
          panels.getUserActionRevision(threadRef),
        );
      }
    }
    if (!serverThread || plugins === undefined) return;
    const choice = pluginViewsWithEntrypoint(plugins, "thread")[0];
    if (choice === undefined || !offerOnce(threadKey)) return;
    if (surfaces().some((surface) => surface.kind === "plugin-app")) return;
    const panels = useRightPanelStore.getState();
    panels.openProactive(
      threadRef,
      pluginAppSurface(choice),
      panels.getUserActionRevision(threadRef),
    );
  }, [enabled, threadRef, serverThread, plugins]);
}
