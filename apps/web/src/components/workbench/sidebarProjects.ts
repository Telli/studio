import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";

import { chatStanding } from "./chatStanding";
import { historyOutcome } from "./projectHistory";
import type { ListedFolder, ListedProject } from "./projectList";
import { NO_PROJECT } from "./freeformChat";
import { projectChats, workspaceTitle } from "./workspaceTitle";

/** A project down the sidebar, or a folder in none, or the older chats that have neither. */
export interface SidebarProject {
  readonly id: string;
  readonly name: string;
  /** Where its new chats start; null for chats in no project, which have nowhere to. */
  readonly folder: EnvironmentProject | null;
  readonly folderIds: ReadonlyArray<string>;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  /** Its menu's subject; null for what is not a Studio project. */
  readonly card: ListedProject | null;
  readonly latest: string;
}

/**
 * Every project with its chats, the one last worked on first: by work, never by opening, so a row
 * stays under the pointer as the person goes between them. Then the folders in no project that hold
 * a chat or are open (`currentFolderId`), and last the chats in no project at all.
 */
export function sidebarProjects(input: {
  readonly cards: ReadonlyArray<ListedProject>;
  readonly loose: ReadonlyArray<ListedFolder>;
  readonly unfiled: ReadonlyArray<EnvironmentThreadShell>;
  /** The folder the unfiled chats are in, which lists as "No project". */
  readonly freeFolderId: string | null;
  readonly currentFolderId: string | null;
}): SidebarProject[] {
  const projects: SidebarProject[] = input.cards
    .map((card) => ({
      id: card.id,
      name: workspaceTitle(card.project.name, card.folder?.workspaceRoot ?? null),
      folder: card.folder,
      folderIds: card.folders.map((folder) => folder.id as string),
      threads: card.threads,
      card,
      latest: card.latest,
    }))
    .toSorted((a, b) => b.latest.localeCompare(a.latest));
  const folders: SidebarProject[] = input.loose
    .filter(
      ({ folder, threads }) =>
        folder.id !== input.freeFolderId &&
        (threads.length > 0 || folder.id === input.currentFolderId),
    )
    .map(({ folder, threads, latest }) => ({
      id: `folder:${folder.id}`,
      name: workspaceTitle(null, folder.workspaceRoot),
      folder,
      folderIds: [folder.id],
      threads,
      card: null,
      latest,
    }));
  const unfiled: SidebarProject[] =
    input.unfiled.length === 0
      ? []
      : [
          {
            id: "no-project",
            name: NO_PROJECT,
            folder: null,
            folderIds: input.freeFolderId === null ? [] : [input.freeFolderId],
            threads: input.unfiled,
            card: null,
            latest: "",
          },
        ];
  return [...projects, ...folders, ...unfiled];
}

/** How many of a project's chats show before Show more. */
export const SHOWN_CHATS = 5;

/** A project's chats, newest first, cut to the first few; the open one always among them. */
export function shownChats(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  currentId: string | null,
  all: boolean,
): { readonly chats: EnvironmentThreadShell[]; readonly hidden: number } {
  const chats = projectChats(threads);
  if (all || chats.length <= SHOWN_CHATS) return { chats, hidden: 0 };
  const first = chats.slice(0, SHOWN_CHATS);
  const open = chats.find((chat) => chat.id === currentId);
  const shown = open === undefined || first.includes(open) ? first : [...first.slice(0, -1), open];
  return { chats: shown, hidden: chats.length - shown.length };
}

/** What a folded project says of its chats: one needs the person, or one is at work. */
export function foldedStanding(
  threads: ReadonlyArray<EnvironmentThreadShell>,
): { readonly text: string; readonly tone: string } | null {
  const said = (outcome: string) => threads.find((chat) => historyOutcome(chat) === outcome);
  const chat = said("needs-you") ?? said("working");
  return chat === undefined ? null : chatStanding(chat);
}
