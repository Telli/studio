import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

/**
 * The project workspace on screen, as its top bar knows it (`StudioPanelBar`), for the quick find
 * (`StudioQuickFind`), which opens over everything: its thread, its folder, and the part its jobs
 * are for (the part last on screen, else the lead part; null with no part yet). Null off a
 * workspace.
 */
export interface OpenWorkspace {
  readonly threadRef: ScopedThreadRef;
  readonly folder: string;
  readonly part: { readonly path: string; readonly kind: string } | null;
  /** How the project's parts are made, from its setup. */
  readonly process: string | undefined;
}

export const useOpenWorkspaceStore = create<{
  readonly workspace: OpenWorkspace | null;
  readonly setWorkspace: (workspace: OpenWorkspace | null) => void;
}>()((set) => ({
  workspace: null,
  setWorkspace: (workspace) => set({ workspace }),
}));
