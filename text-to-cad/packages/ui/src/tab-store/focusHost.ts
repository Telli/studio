/**
 * The place in a part's script the host asks the part on screen to show (Studio's References, which
 * open a part at the line an answer cites, `studio/focus`): the script's path as the host names it, a
 * line of it, and the host's number for the ask (`nonce`), new with each. The viewer takes it from its
 * host context (`apps/mcp` `App.tsx`); the STEP view selects the feature whose statement holds the
 * line once the part is read, and says the ask is taken however it went (`take`), so the host lets it
 * go (`step/StepSurface.jsx`, `step/edit/focus.js`). One per page, as a page is one view.
 */
export interface Focus {
  readonly path: string;
  readonly line: number;
  readonly nonce: number;
}

let focus: Focus | null = null;
const listeners = new Set<() => void>();
const takers = new Set<(nonce: number) => void>();

/** An ask as the host's context says it: a path, a line from 1 and a number, or none. */
function read(value: unknown): Focus | null {
  if (typeof value !== 'object' || value === null) return null;
  const { path, line, nonce } = value as Record<string, unknown>;
  const asked = typeof path === 'string' && path !== '' && Number.isSafeInteger(line) && (line as number) >= 1
    && typeof nonce === 'number' && Number.isFinite(nonce);
  return asked ? Object.freeze({ path, line: line as number, nonce }) : null;
}

const same = (a: Focus | null, b: Focus | null) =>
  a === b || (a !== null && b !== null && a.path === b.path && a.line === b.line && a.nonce === b.nonce);

export const focusHost = {
  /** The ask the host makes now, or null. */
  get: (): Focus | null => focus,
  /** The host's context says what it asks: anything but a well-formed ask is none. */
  set(next: unknown): void {
    const value = read(next);
    if (same(focus, value)) return;
    focus = value;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** The part on screen has taken the ask numbered `nonce`: its feature selected, or nothing there to select. */
  take(nonce: number): void {
    for (const taker of takers) taker(nonce);
  },
  subscribeTaken(taker: (nonce: number) => void): () => void {
    takers.add(taker);
    return () => {
      takers.delete(taker);
    };
  },
};
