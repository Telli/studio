import { create } from "zustand";

/**
 * Whether a project's chats are folded away under their heading in its page beside the rail
 * (`StudioSidebar`), as an Overview module folds. Per device, as the person last chose.
 */
const FOLDED_KEY = "studio:chats-folded";

function readFolded(): boolean {
  try {
    return globalThis.localStorage?.getItem(FOLDED_KEY) === "true";
  } catch {
    return false;
  }
}

export const useChatScopeStore = create<{
  readonly folded: boolean;
  readonly toggleFolded: () => void;
}>()((set, get) => ({
  folded: readFolded(),
  toggleFolded: () => {
    const folded = !get().folded;
    set({ folded });
    try {
      globalThis.localStorage?.setItem(FOLDED_KEY, String(folded));
    } catch {
      // Storage is full or off: the choice holds until the window closes.
    }
  },
}));
