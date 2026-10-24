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
