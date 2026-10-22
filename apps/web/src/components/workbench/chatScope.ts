import { create } from "zustand";

/**
 * Which chats the sidebar lists in a project (`StudioSidebar`): every project's (All, as a chat
 * app's recent chats) or the open project's alone (This project). Home lists them all. Per device,
 * as the person last chose it, like the starred projects.
 */
export type ChatScope = "all" | "project";

const STORAGE_KEY = "studio:chat-scope";

function readScope(): ChatScope {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "project" ? "project" : "all";
  } catch {
    return "all";
  }
}

export const useChatScopeStore = create<{
  readonly scope: ChatScope;
  readonly setScope: (scope: ChatScope) => void;
}>()((set) => ({
  scope: readScope(),
  setScope: (scope) => {
    set({ scope });
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, scope);
    } catch {
      // Storage is full or off: the choice holds until the window closes.
    }
  },
}));
