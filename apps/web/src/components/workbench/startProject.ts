import { studioFolderKey } from "@t3tools/shared/studioProjects";

/**
 * Starting a project from Home (`StudioHome.tsx`): a name to begin with, which the agent replaces
 * with a proper one in its first reply (`studioProjectContext`), and the first message, held until
 * the new project's workspace has a composer to send it from (`usePendingStart.ts`).
 */

const NAME_LENGTH = 32;
/** How a description asks for something before saying what: "I wanna make a", "Can you design". */
const LEADING_REQUEST = new RegExp(
  `^(?:(?:${[
    "please",
    "so",
    "okay",
    "ok",
    "hey",
    "i",
    "we",
    "i'd",
    "we'd",
    "i'm",
    "we're",
    "want to",
    "want",
    "wanna",
    "need to",
    "need",
    "would like to",
    "would like",
    "like to",
    "let's",
    "lets",
    "help me",
    "can you",
    "could you",
    "can we",
    "could we",
    "can i",
    "try to",
    "trying to",
    "going to",
    "gonna",
    "to",
    "make me",
    "make",
    "design",
    "create",
    "build",
    "model",
    "print",
  ].join("|")})\\s+)*(?:(?:a|an|the|some|my|our)\\s+)?`,
  "i",
);
/** Words that start a new clause: the name is what comes before one, once that is two words. */
const CLAUSE = new Set([
  "that",
  "which",
  "who",
  "maybe",
  "so",
  "because",
  "but",
  "if",
  "i",
  "we",
  "please",
  "is",
  "are",
]);
const DANGLING = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "on",
  "for",
  "to",
  "with",
  "that",
  "my",
  "in",
]);

/**
 * A name from the description's first words: its first sentence without the asking, up to where a
 * new clause starts, cut on a word near 32 characters.
 */
export function provisionalProjectName(description: string): string {
  const sentence =
    description
      .trim()
      .replace(/\s+/g, " ")
      .split(/[.!?;]|,\s/)[0] ?? "";
  const words = sentence.replace(LEADING_REQUEST, "").split(" ").filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if (kept.length >= 2 && CLAUSE.has(word.toLowerCase())) break;
    if ([...kept, word].join(" ").length > NAME_LENGTH && kept.length > 0) break;
    kept.push(word);
  }
  while (kept.length > 0 && DANGLING.has(kept[kept.length - 1]!.toLowerCase())) kept.pop();
  const name = kept.join(" ");
  return name === "" ? "New project" : name.charAt(0).toUpperCase() + name.slice(1);
}

/** What the new project's first chat sends: the description or the new work's job, and any files. */
export interface PendingStart {
  readonly prompt: string;
  readonly files: ReadonlyArray<File>;
}

/** By the new project's folder: the workspace that opens there takes it. Session only. */
const pending = new Map<string, PendingStart>();

export function setPendingStart(folder: string, start: PendingStart): void {
  pending.set(studioFolderKey(folder), start);
}

/** The folder's first message, once: the second call gets null, so nothing is sent twice. */
export function takePendingStart(folder: string): PendingStart | null {
  const key = studioFolderKey(folder);
  const start = pending.get(key) ?? null;
  pending.delete(key);
  return start;
}
