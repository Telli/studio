import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

/**
 * What a CAD view says of the part on screen (`studio/notifications/edit-state`): whether its file
 * has a part script, so the viewer has both layouts, and whether a command, sketch or pick is open
 * or a change is being saved, which holds the layout until it is finished or cancelled.
 */
export interface ViewerEditState {
  readonly editable: boolean;
  readonly busy: boolean;
  /** How many builds the view's page saw end (CAD mode's): it only grows while the page lives. */
  readonly builds?: number;
}

/**
 * A plugin view by its thread and its panel tab (the frame's own key): the same for the frame that
 * reports (`PluginViewPanel`) and the bar that reads it (`StudioPanelBar`).
 */
export function pluginViewKey(threadRef: ScopedThreadRef, surfaceId: string): string {
  return `${scopedThreadKey(threadRef)}|${surfaceId}`;
}

/**
 * Each open CAD view's edit state, by its key. A view's host forgets it as it goes, closed or
 * reopened on another file (`PluginViewFrame`), so nothing is ever held for a view that is gone.
 */
export const useViewerEditState = create<{
  readonly byView: Readonly<Record<string, ViewerEditState>>;
  readonly set: (key: string, state: ViewerEditState) => void;
  readonly remove: (key: string) => void;
}>()((setState, get) => ({
  byView: {},
  set: (key, { editable, busy }) => {
    const current = get().byView[key];
    if (current?.editable === editable && current.busy === busy) return;
    setState({ byView: { ...get().byView, [key]: { editable, busy } } });
  },
  remove: (key) => {
    buildsByView.delete(key);
    if (!(key in get().byView)) return;
    const { [key]: _gone, ...rest } = get().byView;
    setState({ byView: rest });
  },
}));

// The builds each open view last said it saw end (`heardBuilds`), by its key.
const buildsByView = new Map<string, number>();

/**
 * Whether a view's edit state names a build it saw end that was not heard yet, for Studio to list
 * the part it built (`modelsChanged`). The count only grows while the view's page lives, so a new
 * count is a new build; a page loaded again counts from none.
 */
export function heardBuilds(key: string, builds: number | undefined): boolean {
  if (builds === undefined) return false;
  const last = buildsByView.get(key);
  buildsByView.set(key, builds);
  return builds > 0 && builds !== last;
}

/** Whether the view in front has a command or sketch open; a view that is gone has none. */
export function frontViewBusy(
  byView: Readonly<Record<string, ViewerEditState>>,
  key: string | null,
): boolean {
  return key !== null && byView[key]?.busy === true;
}
