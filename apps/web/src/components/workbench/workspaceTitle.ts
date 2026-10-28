/** How a project's workspace names itself and its chats (`StudioWorkspaceBar.tsx`, `StudioSidebar.tsx`). */

/** The project's Studio name, else the folder's own name. */
export function workspaceTitle(studioName: string | null, folder: string | null): string {
  if (studioName !== null && studioName.trim() !== "") return studioName.trim();
  if (folder === null) return "New chat";
  const segments = folder.split(/[\\/]+/).filter(Boolean);
  return segments[segments.length - 1] ?? folder;
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
