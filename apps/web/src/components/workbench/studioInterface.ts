import { useSyncExternalStore } from "react";

import { HARDWARE_FOCUS } from "./hardwareActions";
import { WORKBENCH_LAYOUT } from "./workbenchLayout";

/**
 * How Studio presents itself, the person's choice (Settings, Appearance,
 * Interface; or the command palette):
 *
 * - `engineering`: parts, checks and outputs first. The title block over the
 *   viewer, Check, Make and Document, the project's parts on a new thread,
 *   and the coding tools (branches, diffs, terminal, raw commands) put away.
 * - `code`: T3 Code's own surfaces, for working on the code behind a model.
 *
 * Offered only by a brand with a hardware focus (`brand.json` `"focus":
 * "hardware"`), which also makes `engineering` the default. Per device, like
 * the panel widths: `<html data-studio-focus>` carries it for `theme.css`.
 */
export type StudioInterface = "engineering" | "code";

/** The panel surfaces the engineering interface leaves out of its launcher and "+" menu. */
export const CODE_SURFACE_LABELS: ReadonlySet<string> = new Set([
  "Terminal",
  "Diff",
  "Pull request",
  "Linked pull requests",
  "Device",
]);

/** What the composer offers in the engineering interface, in place of T3's coding hints. */
export const ENGINEERING_COMPOSER_PLACEHOLDER =
  "Describe a change to the part, or ask about the design";

/** The composer on a thread that has already run, in place of T3's "send follow-ups". */
export const ENGINEERING_FOLLOW_UP_PLACEHOLDER =
  "Ask for a change, a check, or attach a sketch or photo";

/**
 * Settings sections the engineering interface leaves out of its nav and
 * search. Their pages still open when visited, and the code interface lists them.
 */
export const CODE_SETTINGS_SECTIONS: ReadonlySet<string> = new Set([
  "/settings/keybindings",
  "/settings/snap-shot",
  "/settings/integrations",
  "/settings/scheduled-tasks",
  "/settings/source-control",
  "/settings/storage",
  "/settings/connections",
]);

const ENGINEERING_SETTINGS_LABELS: Readonly<Record<string, string>> = {
  "/settings/providers": "AI agents",
};

/** A settings section's name in the given interface: engineering calls Providers "AI agents". */
export function settingsSectionLabel(path: string, label: string, engineering: boolean): string {
  return (engineering ? ENGINEERING_SETTINGS_LABELS[path] : undefined) ?? label;
}

export const STUDIO_INTERFACE_AVAILABLE = WORKBENCH_LAYOUT && HARDWARE_FOCUS;
const STORAGE_KEY = "studio:interface";
const DEFAULT_INTERFACE: StudioInterface = "engineering";

function read(): StudioInterface {
  if (!STUDIO_INTERFACE_AVAILABLE) return "code";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "code" || stored === "engineering" ? stored : DEFAULT_INTERFACE;
  } catch {
    return DEFAULT_INTERFACE;
  }
}

let current: StudioInterface = typeof window === "undefined" ? "code" : read();
const listeners = new Set<() => void>();

/** The stylesheet's switch: `hardware` dresses the app as an engineering tool. */
function apply() {
  if (typeof document === "undefined" || !STUDIO_INTERFACE_AVAILABLE) return;
  document.documentElement.dataset.studioFocus = current === "engineering" ? "hardware" : "code";
}
apply();

function notify(next: StudioInterface) {
  if (next === current) return;
  current = next;
  apply();
  for (const listener of listeners) listener();
}

export function setStudioInterface(next: StudioInterface) {
  if (!STUDIO_INTERFACE_AVAILABLE) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage is off: the choice holds until the window closes.
  }
  notify(next);
}

// Another window of the app switched: follow it.
if (typeof window !== "undefined" && STUDIO_INTERFACE_AVAILABLE) {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) notify(read());
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useStudioInterface(): StudioInterface {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => "code" as const,
  );
}

/**
 * The command palette's switch to the other interface, or null where Studio
 * offers none. Read when the palette lists its actions.
 */
export function studioInterfaceCommand(): {
  readonly title: string;
  readonly searchTerms: ReadonlyArray<string>;
  readonly run: () => void;
} | null {
  if (!STUDIO_INTERFACE_AVAILABLE) return null;
  const next: StudioInterface = current === "engineering" ? "code" : "engineering";
  return {
    title: next === "code" ? "Switch to the code interface" : "Switch to the engineering interface",
    searchTerms: ["studio", "interface", "engineering", "code", "mode", "view", "hardware"],
    run: () => setStudioInterface(next),
  };
}

/** Whether Studio is dressed as an engineering app, for code outside React (timeline labels). */
export function isEngineeringInterface(): boolean {
  return current === "engineering";
}

/** Whether Studio is dressed as an engineering app right now. */
export function useEngineeringInterface(): boolean {
  return useStudioInterface() === "engineering";
}
