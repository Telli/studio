/** The Chats page's filter, in the URL (`/chats?filter=needs-you`): every chat, or only those waiting on the person. */
export type ChatsFilter = "needs-you";

/** The Chats page's place in the URL: its filter. */
export interface ChatsSearch {
  readonly filter?: ChatsFilter | undefined;
}

/**
 * The Chats page's search as its route reads it. A filter it does not know is left out, not an
 * error, so the old `/needs-you` address (which redirects with the filter) and a shared link both land.
 */
export function validateChatsSearch(raw: Record<string, unknown>): ChatsSearch {
  return { filter: raw.filter === "needs-you" ? "needs-you" : undefined };
}
