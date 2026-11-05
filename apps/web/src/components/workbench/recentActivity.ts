import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import type { OpenedThreads } from "./openedThreads";
import { historyOutcome } from "./projectHistory";
import type { ListedProject } from "./projectList";
import type { RecentFile } from "./recentFiles";

/** Something Recent lists (⌘K outside a project): a chat opened lately, or a file opened beside one. */
export type RecentItem =
  | {
      readonly kind: "chat";
      readonly at: string;
      readonly card: ListedProject;
      readonly thread: EnvironmentThreadShell;
    }
  | {
      readonly kind: "file";
      readonly at: string;
      readonly card: ListedProject;
      readonly thread: EnvironmentThreadShell;
      readonly file: RecentFile;
    };

/**
 * What was opened lately across every project, newest first, as Google Drive's Recent lists it:
 * chats when they were last open on this device, files when they were last opened beside a chat.
 * A file whose chat or project is gone is left out.
 */
export function homeRecent(
  cards: ReadonlyArray<ListedProject>,
  opened: OpenedThreads,
  files: ReadonlyArray<RecentFile>,
  limit = 8,
): RecentItem[] {
  const owned = cards.flatMap((card) => card.threads.map((thread) => ({ card, thread })));
  const chats: RecentItem[] = owned.flatMap(({ card, thread }) => {
    const at = opened[scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))];
    return at === undefined ? [] : [{ kind: "chat", at, card, thread }];
  });
  const shown: RecentItem[] = files.flatMap((file) => {
    const owner = owned.find(
      ({ thread }) => thread.environmentId === file.environmentId && thread.id === file.threadId,
    );
    return owner === undefined ? [] : [{ kind: "file", at: file.at, ...owner, file }];
  });
  return [...chats, ...shown].toSorted((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/**
 * The chats opened lately on this device across every project, newest first, all but the one open
 * (`openId`): what ⌘K leads with inside a project, so ⌘K then Enter goes back to the chat before,
 * whichever project it is in.
 */
export function recentChats(
  cards: ReadonlyArray<ListedProject>,
  opened: OpenedThreads,
  openId: string | null,
  limit = 5,
): Array<{ readonly card: ListedProject; readonly thread: EnvironmentThreadShell }> {
  return homeRecent(cards, opened, [], limit + 1)
    .filter((item) => item.thread.id !== openId)
    .slice(0, limit)
    .map(({ card, thread }) => ({ card, thread }));
}

/** The newest chat waiting on the person (a question, an approval) of these; null when none is. */
export function waitingChat(
  threads: ReadonlyArray<EnvironmentThreadShell>,
): EnvironmentThreadShell | null {
  let newest: EnvironmentThreadShell | null = null;
  for (const thread of threads) {
    if (historyOutcome(thread) !== "needs-you") continue;
    if (newest === null || thread.updatedAt > newest.updatedAt) newest = thread;
  }
  return newest;
}

/** The chats waiting on the person (a question, an approval), in any project, newest first: Home's tiles say so. */
export function needsYou(
  cards: ReadonlyArray<ListedProject>,
): Array<{ readonly card: ListedProject; readonly thread: EnvironmentThreadShell }> {
  return cards
    .flatMap((card) => card.threads.map((thread) => ({ card, thread })))
    .filter(({ thread }) => historyOutcome(thread) === "needs-you")
    .toSorted((a, b) => b.thread.updatedAt.localeCompare(a.thread.updatedAt));
}
