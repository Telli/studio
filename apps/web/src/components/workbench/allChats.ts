import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useThreadShells } from "~/state/entities";
import { NO_PROJECT, noProjectChats, useNoProjectFolder } from "./freeformChat";
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

/** The chats whose name or project's name holds every word typed; all of them with nothing typed. */
export function findChats<T extends { readonly id: string; readonly title: string }>(
  chats: ReadonlyArray<T>,
  projectOf: ReadonlyMap<string, string>,
  query: string,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...chats];
  return chats.filter((chat) => {
    const text = `${chat.title} ${projectOf.get(chat.id) ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/**
 * Every Studio project's chats, from Home's project list, and the chats in no project, from Home's
 * Ask (`freeformChat.ts`): Chats, and the sidebar's recent chats.
 */
export function useAllChats(environmentId: EnvironmentId) {
  const { cards } = useProjectList(environmentId);
  const free = useNoProjectFolder(environmentId).project;
  const threads = useThreadShells();
  return useMemo(() => {
    const unfiled = noProjectChats(threads, environmentId, free?.id ?? null).filter(
      (thread) => thread.archivedAt === null,
    );
    return allChats([
      ...cards.map((card) => ({
        name: workspaceTitle(card.project.name, card.folder?.workspaceRoot ?? null),
        threads: card.threads,
      })),
      ...(unfiled.length > 0 ? [{ name: NO_PROJECT, threads: unfiled }] : []),
    ]);
  }, [cards, environmentId, free, threads]);
}
