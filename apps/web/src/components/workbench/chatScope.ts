import { create } from "zustand";

/**
 * Which projects show their chats down the sidebar (`StudioSidebar`), as a folder opens in a file
 * tree. A project is open while it is the active one, unless the person folded it there, and for
 * as long as they opened it by hand: per device, as they last left it. Going to a project opens it
 * without adding it to what they opened, so the list does not grow as they move around.
 */
const OPEN_KEY = "studio:projects-opened";

function readOpened(): ReadonlyArray<string> {
  try {
    const saved: unknown = JSON.parse(globalThis.localStorage?.getItem(OPEN_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function keep(opened: ReadonlyArray<string>): void {
  try {
    globalThis.localStorage?.setItem(OPEN_KEY, JSON.stringify(opened));
  } catch {
    // Storage is full or off: the choice holds until the window closes.
  }
}

interface ChatScope {
  /** The projects opened by hand. */
  readonly opened: ReadonlyArray<string>;
  /** The active project, where the person folded it. */
  readonly foldedActive: string | null;
  readonly toggle: (id: string, active: boolean) => void;
  /** The active project changed: it opens, however the last visit left it. */
  readonly arrive: () => void;
}

/** Whether a project shows its chats. */
export const projectOpen = (
  scope: Pick<ChatScope, "opened" | "foldedActive">,
  id: string,
  active: boolean,
) => scope.opened.includes(id) || (active && scope.foldedActive !== id);

export const useChatScopeStore = create<ChatScope>()((set, get) => ({
  opened: readOpened(),
  foldedActive: null,
  toggle: (id, active) => {
    const { opened, foldedActive } = get();
    const open = projectOpen({ opened, foldedActive }, id, active);
    const next = open ? opened.filter((each) => each !== id) : [...opened, id];
    set({ opened: next, foldedActive: open && active ? id : null });
    keep(next);
  },
  arrive: () => set({ foldedActive: null }),
}));
