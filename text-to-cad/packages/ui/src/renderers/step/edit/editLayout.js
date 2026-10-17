import { useCallback, useState } from "react";

/**
 * How a model with a part script opens: laid out for modeling it by hand (`manual`: edit mode,
 * the ribbon, design tree and PropertyManager of a CAD tool) or for asking the AI (`ai`: the
 * viewer as it is, where a selection on the model goes to the agent). Kept for every file, as a
 * person keeps working one way; a host whose storage throws (a sandboxed frame) keeps it for the
 * session.
 */
const LAYOUT_KEY = "cad:edit-layout";
export const LAYOUTS = Object.freeze(["manual", "ai"]);
let kept = null;

export function readLayout() {
  if (kept) return kept;
  try {
    const value = window.localStorage.getItem(LAYOUT_KEY);
    if (LAYOUTS.includes(value)) return value;
  } catch {
    // No storage here: Manual until the person turns the switch.
  }
  return "manual";
}

export function useEditLayout() {
  const [layout, setLayout] = useState(readLayout);
  const change = useCallback(next => {
    if (!LAYOUTS.includes(next)) return;
    kept = next;
    try {
      window.localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // Kept for the session only.
    }
    setLayout(next);
  }, []);
  return [layout, change];
}
