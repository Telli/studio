import { create } from "zustand";

/**
 * What the pinned Project tab shows in engineering with code tools: the
 * project page, or the project's source files in T3 Code's explorer. The
 * engineering interface always shows the project page; the code interface has
 * no pinned tab. For the session, on every thread alike.
 */
export type ProjectView = "project" | "source";

export const useProjectViewStore = create<{
  readonly view: ProjectView;
  readonly setView: (view: ProjectView) => void;
}>()((set) => ({
  view: "project",
  setView: (view) => set({ view }),
}));
