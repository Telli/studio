import { create } from "zustand";

import type { Discipline } from "./newTemplates";

/** New asked for from outside it: on a discipline, else the first; on a template, else its first. */
export interface NewRequest {
  readonly discipline: Discipline | null;
  readonly templateId: string | null;
}

/**
 * Opens New from outside it (`NewDialog`): the library's Make
 * one. A request is used once. The first New to see it (`StudioNew`, or `ProjectPage` with code
 * tools on) takes it into its own open state and opens on it, so it opens once, and nothing is
 * left for a New mounted later.
 */
export const useNewDialogStore = create<{
  /** The request no New has taken yet. */
  readonly request: NewRequest | null;
  readonly ask: (discipline?: Discipline, templateId?: string) => void;
  /** Hands the request over and clears it: null when there is none, or another New took it. */
  readonly take: () => NewRequest | null;
}>()((set, get) => ({
  request: null,
  ask: (discipline, templateId) =>
    set({ request: { discipline: discipline ?? null, templateId: templateId ?? null } }),
  take: () => {
    const { request } = get();
    if (request !== null) set({ request: null });
    return request;
  },
}));
