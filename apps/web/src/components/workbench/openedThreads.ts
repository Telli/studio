import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

/** When each thread was last open on this device, by its scoped key. */
export type OpenedThreads = Readonly<Record<string, string>>;

const OPENED_STORAGE_KEY = "studio:opened-threads";
/** Threads remembered as opened; the oldest are forgotten past this. */
const OPENED_LIMIT = 500;

export function readOpened(): OpenedThreads {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(OPENED_STORAGE_KEY) ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

/** `opened` with the thread open at `at`, the longest unopened forgotten past `limit`. */
export function withOpened(
  opened: OpenedThreads,
  threadKey: string,
  at: string,
  limit = OPENED_LIMIT,
): OpenedThreads {
  const others = Object.entries(opened)
    .filter(([key]) => key !== threadKey)
    .toSorted((a, b) => a[1].localeCompare(b[1]));
  return Object.fromEntries([
    ...others.slice(Math.max(0, others.length - limit + 1)),
    [threadKey, at],
  ]);
}

export function rememberOpened(threadKey: string, at: string): void {
  try {
    window.localStorage.setItem(
      OPENED_STORAGE_KEY,
      JSON.stringify(withOpened(readOpened(), threadKey, at)),
    );
  } catch {
    // Storage is full or off: opening the project goes to the thread last worked on instead.
  }
}

/**
 * The thread opening a project goes back to, of its live threads: the one last
 * open on this device, else the one last worked on. Null when it has none, so a
 * new one starts.
 */
export function threadToOpen<
  T extends {
    readonly environmentId: EnvironmentId;
    readonly id: ThreadId;
    readonly updatedAt: string;
  },
>(threads: ReadonlyArray<T>, opened: OpenedThreads): T | null {
  let last: T | null = null;
  let lastOpened = "";
  for (const thread of threads) {
    const at = opened[scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))];
    if (at !== undefined && at > lastOpened) {
      last = thread;
      lastOpened = at;
    }
  }
  return (
    last ??
    threads.reduce<T | null>(
      (newest, thread) =>
        newest === null || thread.updatedAt > newest.updatedAt ? thread : newest,
      null,
    )
  );
}
