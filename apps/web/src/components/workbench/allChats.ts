import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useProjectList } from "./useProjectList";
import { projectChats, workspaceTitle } from "./workspaceTitle";

interface ChatLike {
  readonly id: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

/**
 * Every chat in every project, newest first, as a chat app lists its recent chats, with the name
 * of the project each is in. A chat in folders two projects share is listed once, under the first.
 */
export function allChats<T extends ChatLike>(
  projects: ReadonlyArray<{ readonly name: string; readonly threads: ReadonlyArray<T> }>,
): { readonly chats: T[]; readonly projectOf: ReadonlyMap<string, string> } {
  const byId = new Map<string, T>();
  const projectOf = new Map<string, string>();
  for (const project of projects) {
    for (const thread of project.threads) {
      if (byId.has(thread.id)) continue;
      byId.set(thread.id, thread);
      projectOf.set(thread.id, project.name);
    }
  }
  return { chats: projectChats([...byId.values()]), projectOf };
}

/** The sidebar's All (`StudioSidebar`): every Studio project's chats, from Home's project list. */
export function useAllChats(environmentId: EnvironmentId) {
  const { cards } = useProjectList(environmentId);
  return useMemo(
    () =>
      allChats(
        cards.map((card) => ({
          name: workspaceTitle(card.project.name, card.folder?.workspaceRoot ?? null),
          threads: card.threads,
        })),
      ),
    [cards],
  );
}
