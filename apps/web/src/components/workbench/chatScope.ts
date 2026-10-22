import { create } from "zustand";

/**
 * How the sidebar lists chats (`StudioSidebar`): in a project, every project's (All, as a chat
 * app's recent chats) or the open project's alone (This project), Home listing them all; and
 * whether the list is folded away under its heading, as an Overview module folds. Per device, as
 * the person last chose, like the starred projects.
 */
export type ChatScope = "all" | "project";

const SCOPE_KEY = "studio:chat-scope";
const FOLDED_KEY = "studio:chats-folded";

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage is full or off: the choice holds until the window closes.
  }
}

export const useChatScopeStore = create<{
  readonly scope: ChatScope;
  readonly folded: boolean;
  readonly setScope: (scope: ChatScope) => void;
  readonly toggleFolded: () => void;
}>()((set, get) => ({
  scope: read(SCOPE_KEY) === "project" ? "project" : "all",
  folded: read(FOLDED_KEY) === "true",
  setScope: (scope) => {
    set({ scope });
    remember(SCOPE_KEY, scope);
  },
  toggleFolded: () => {
    const folded = !get().folded;
    set({ folded });
    remember(FOLDED_KEY, String(folded));
  },
}));
