import { create } from "zustand";

/**
 * Where the rail (`StudioRail`) has the person: Home, a page of its own beside the rail; or one of
 * the lists the sidebar shows beside it: every chat, the projects (inside a project, its own page:
 * Overview, New chat and its chats), or what is waiting on them. As Slack's rail picks the list
 * beside it, and the page stays until something in the list is opened.
 */
export type StudioListPlace = "chats" | "projects" | "needs";
export type StudioRailMark = "home" | StudioListPlace | "settings";

const LIST_KEY = "studio:rail-list";

function readList(): StudioListPlace {
  try {
    const value = globalThis.localStorage?.getItem(LIST_KEY);
    return value === "chats" || value === "needs" ? value : "projects";
  } catch {
    return "projects";
  }
}

/**
 * The list beside the rail, as the person last chose it on this device; and whether, inside a
 * project, they went back to every project's list from its own page.
 */
export const useStudioPlaceStore = create<{
  readonly list: StudioListPlace;
  readonly allProjects: boolean;
  readonly showList: (list: StudioListPlace) => void;
  readonly setAllProjects: (allProjects: boolean) => void;
}>()((set) => ({
  list: readList(),
  allProjects: false,
  showList: (list) => {
    set({ list, allProjects: false });
    try {
      globalThis.localStorage?.setItem(LIST_KEY, list);
    } catch {
      // Storage is full or off: the choice holds until the window closes.
    }
  },
  setAllProjects: (allProjects) => set({ allProjects }),
}));

/** What the rail marks: Settings on its pages, the list while it shows, else Home while it shows. */
export function railMark(input: {
  readonly pathname: string;
  readonly listOpen: boolean;
  readonly list: StudioListPlace;
}): StudioRailMark | null {
  if (input.pathname === "/settings" || input.pathname.startsWith("/settings/")) return "settings";
  if (input.listOpen) return input.list;
  return input.pathname === "/" ? "home" : null;
}

/**
 * The list beside the rail as the page changes. Home shows on its own: arriving there folds the
 * list away, and leaving brings it back as it was before. A list the person opened on Home from
 * the rail stays open as they leave through it.
 */
export function listOnPageChange(input: {
  readonly wasHome: boolean;
  readonly isHome: boolean;
  readonly open: boolean;
  readonly openBeforeHome: boolean | null;
}): { readonly open: boolean; readonly openBeforeHome: boolean | null } {
  if (input.isHome && !input.wasHome) return { open: false, openBeforeHome: input.open };
  if (!input.isHome && input.wasHome) {
    return { open: input.open || (input.openBeforeHome ?? true), openBeforeHome: null };
  }
  return { open: input.open, openBeforeHome: input.openBeforeHome };
}
