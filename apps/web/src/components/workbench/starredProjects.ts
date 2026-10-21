import { create } from "zustand";

/**
 * The projects a person starred, to keep at the top of the switcher and Home (`StarButton`), as
 * Drive's Starred and Figma's Favorites do. Per device, like the folded Overview modules, by the
 * Studio project's id.
 */

const STORAGE_KEY = "studio:starred-projects";

function readStarred(): ReadonlyArray<string> {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export const useStarredStore = create<{
  readonly starred: ReadonlyArray<string>;
  readonly toggle: (id: string) => void;
}>()((set, get) => ({
  starred: readStarred(),
  toggle: (id) => {
    const { starred } = get();
    const next = starred.includes(id) ? starred.filter((entry) => entry !== id) : [...starred, id];
    set({ starred: next });
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage is full or off: the star holds until the window closes.
    }
  },
}));

/** The starred projects and the rest, each in the list's own order. */
export function splitStarred<T extends { readonly id: string }>(
  cards: ReadonlyArray<T>,
  starred: ReadonlyArray<string>,
): { readonly starred: T[]; readonly rest: T[] } {
  const marked = new Set(starred);
  return {
    starred: cards.filter((card) => marked.has(card.id)),
    rest: cards.filter((card) => !marked.has(card.id)),
  };
}
