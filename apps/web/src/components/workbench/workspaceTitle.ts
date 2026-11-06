/** How a project's workspace names itself and its chats (`StudioWorkspaceBar.tsx`, `StudioSidebar.tsx`). */

/** Lower-case words and numbers joined by hyphens, as a made folder is named. */
const FOLDER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ONLY_NUMBERS = /^[\d-]+$/;
const LEADING_DATE = /^\d{4}-?\d{2}-?\d{2}-/;

/**
 * A name that is only a folder's slug, as words: "2026-10-05-gear-guard" reads "Gear guard". Only
 * what is shown changes, never the folder. A name a person gave, and a bare date, stay as they are.
 */
function sentenceName(name: string): string {
  if (!FOLDER_SLUG.test(name) || ONLY_NUMBERS.test(name)) return name;
  const words = name.replace(LEADING_DATE, "").replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The project's Studio name, else the folder's own name. */
export function workspaceTitle(studioName: string | null, folder: string | null): string {
  if (studioName !== null && studioName.trim() !== "") return sentenceName(studioName.trim());
  if (folder === null) return "New chat";
  const segments = folder.split(/[\\/]+/).filter(Boolean);
  return sentenceName(segments[segments.length - 1] ?? folder);
}

/** A project's chats as the sidebar lists them: archived ones left out, the newest first. */
export function projectChats<
  T extends { readonly updatedAt: string; readonly archivedAt: string | null },
>(threads: ReadonlyArray<T>): T[] {
  return threads
    .filter((thread) => thread.archivedAt === null)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function chatLabel(title: string): string {
  const named = title.trim();
  if (named === "") return "Untitled chat";
  // T3 titles a chat "New thread" until its first message names it.
  return named === "New thread" ? "New chat" : named;
}
