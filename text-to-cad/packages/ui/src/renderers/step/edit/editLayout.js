import { useCallback } from "react";

/**
 * How a model with a part script opens: laid out for modeling it by hand (`manual`: edit mode,
 * the ribbon, design tree and PropertyManager of a CAD tool) or for asking the AI (`ai`: the
 * viewer as it is, where a selection on the model goes to the agent). One of the tab's settings
 * (`editLayout`, kept by the host's tab store), so it holds for every file the tab shows, as a
 * person keeps working one way.
 */
export const LAYOUTS = Object.freeze(["manual", "ai"]);

/** A pick on the model laid out for modeling it by hand (the workspace), and what the pointer rests on: orange, as the
 * design has the selection (its walkthrough's selected face). The ai layout keeps the viewer's own colour. */
export const WORKSPACE_SELECTION_COLOR = "#ff9a2e";

/**
 * What the switch between the layouts hangs on, from edit mode (`useEditMode`): `editable` once the
 * server says the file has a part script (the two layouts; a build that failed still has them), and
 * `busy` while a command, a sketch or a pick is open or a change is being saved, which holds the
 * switch until it is finished or cancelled. The navbar's switch and a host's own (Studio's Simple
 * view, `tab-store/editLayoutHost.ts`) read the same.
 * @param {{ status: string, command?: unknown, sketch?: unknown, picking?: boolean, saving?: boolean }} edit
 * @returns {{ editable: boolean, busy: boolean }}
 */
export function editLayoutState(edit) {
  return {
    editable: edit.status !== "none" && edit.status !== "probing",
    busy: Boolean(edit.command || edit.sketch || edit.picking || edit.saving),
  };
}

/**
 * Whether the CAD workspace is the layout chosen, for what has no agent in it (Pencil and Shapes, Quick Edit): `manual`
 * chosen for a model with a part script, or one the server has not yet answered for (`probing`), so none of the AI's
 * pieces shows while it is asked and then goes. A model it says has none (`none`) is the viewer as it is, with them all.
 * The workspace itself (`editing`) waits for the answer.
 * @param {string} layout
 * @param {{ status: string }} edit
 */
export function cadChosen(layout, edit) {
  return layout === "manual" && edit.status !== "none";
}

/**
 * The layout and the way to change it, from the shell's services: `preferences` (the tab's
 * settings) and `onPreferenceChange` (its writer).
 * @param {{ preferences?: { editLayout?: string } | null, onPreferenceChange?: (patch: object) => void }} services
 * @returns {[string, (next: string) => void]}
 */
export function useEditLayout({ preferences, onPreferenceChange }) {
  const layout = LAYOUTS.includes(preferences?.editLayout) ? preferences.editLayout : "manual";
  const change = useCallback(next => {
    if (LAYOUTS.includes(next)) onPreferenceChange?.({ editLayout: next });
  }, [onPreferenceChange]);
  return [layout, change];
}
