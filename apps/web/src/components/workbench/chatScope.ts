import { create } from "zustand";

/**
 * Which projects show their chats down the sidebar (`StudioSidebar`), as a folder opens in a file
 * tree. Per device, as the person last left them; opening a chat in a project unfolds it there.
 */
const OPEN_KEY = "studio:projects-unfolded";

function readUnfolded(): ReadonlyArray<string> {
  try {
    const saved: unknown = JSON.parse(globalThis.localStorage?.getItem(OPEN_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function keep(unfolded: ReadonlyArray<string>): void {
  try {
    globalThis.localStorage?.setItem(OPEN_KEY, JSON.stringify(unfolded));
  } catch {
    // Storage is full or off: the choice holds until the window closes.
  }
}

export const useChatScopeStore = create<{
  readonly unfolded: ReadonlyArray<string>;
  readonly toggle: (id: string) => void;
  readonly unfold: (id: string) => void;
}>()((set, get) => ({
  unfolded: readUnfolded(),
  toggle: (id) => {
    const { unfolded } = get();
    const next = unfolded.includes(id) ? unfolded.filter((each) => each !== id) : [...unfolded, id];
    set({ unfolded: next });
    keep(next);
  },
  unfold: (id) => {
    const { unfolded } = get();
    if (unfolded.includes(id)) return;
    const next = [...unfolded, id];
    set({ unfolded: next });
    keep(next);
  },
}));
