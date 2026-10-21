import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { create } from "zustand";

import { partName } from "./partNames";

/**
 * How a project's workspace shows its part: Ask (the CAD viewer as Jake built it, with Annotate
 * and Quick Edit) or Edit by hand (Studio's edit mode, with the ribbon and the design tree). The
 * top bar switches it (`StudioPanelBar.tsx`) and the viewer is told in its host context
 * (`PluginViewFrame.tsx`, `studio/editLayout`). Per project folder, on this device; Ask unless
 * chosen.
 */
export type WorkspaceMode = "ask" | "manual";

const STORAGE_KEY = "studio:workspace-modes";

function readModes(): Record<string, WorkspaceMode> {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (stored === null || typeof stored !== "object") return {};
    return Object.fromEntries(
      Object.entries(stored).filter(
        (entry): entry is [string, WorkspaceMode] => entry[1] === "ask" || entry[1] === "manual",
      ),
    );
  } catch {
    return {};
  }
}

export const useWorkspaceModeStore = create<{
  readonly modes: Readonly<Record<string, WorkspaceMode>>;
  readonly setMode: (folder: string, mode: WorkspaceMode) => void;
  /** The folder of the workspace on screen, whose mode the CAD views take (`PluginViewFrame`). */
  readonly activeFolder: string | null;
  readonly setActiveFolder: (folder: string | null) => void;
}>()((set, get) => ({
  modes: readModes(),
  activeFolder: null,
  setActiveFolder: (folder) => {
    if (get().activeFolder !== folder) set({ activeFolder: folder });
  },
  setMode: (folder, mode) => {
    const modes = { ...get().modes, [studioFolderKey(folder)]: mode };
    set({ modes });
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(modes));
    } catch {
      // Storage full or blocked: the choice still holds for the session.
    }
  },
}));

export function workspaceModeFor(
  modes: Readonly<Record<string, WorkspaceMode>>,
  folder: string | null,
): WorkspaceMode {
  return folder === null ? "ask" : (modes[studioFolderKey(folder)] ?? "ask");
}

export function useWorkspaceMode(folder: string | null): WorkspaceMode {
  return useWorkspaceModeStore((store) => workspaceModeFor(store.modes, folder));
}

/** The layout the CAD views on screen take: the workspace on screen's mode. */
export function useActiveViewerEditLayout(): "ai" | "manual" {
  return useWorkspaceModeStore((store) =>
    viewerEditLayout(workspaceModeFor(store.modes, store.activeFolder)),
  );
}

/** The viewer's own name for the layout (`text-to-cad/packages/ui/.../edit/editLayout.js`). */
export function viewerEditLayout(mode: WorkspaceMode): "ai" | "manual" {
  return mode === "ask" ? "ai" : "manual";
}

/**
 * Whether the panel in front can switch between Ask and Edit by hand: the CAD viewer, on a part
 * (a STEP or a SolidCraft design) or on no file yet. The Overview, a document, a board or a
 * study's result has nothing to edit by hand, so the switch shows only with the viewer up.
 */
export function editsByHand(
  surface: { readonly kind: string; readonly file?: string | undefined } | null | undefined,
): boolean {
  if (surface?.kind !== "plugin-app") return false;
  if (surface.file === undefined) return true;
  const kind = partName(surface.file)?.kind;
  return kind === "Part" || kind === "Design";
}
