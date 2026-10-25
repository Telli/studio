import type { OrchestrationV2TurnItem } from "@t3tools/contracts";

import type { TimelineEntry } from "~/session-logic";
import { classifyProjectFile } from "../projectFiles";
import { splitSources, type SourceTarget } from "./answerSources";

/**
 * The References under an answer: what it cites (`splitSources`), each source marked by whether
 * the agent opened it in this chat, from the tools the chat shows it using. An answer that cites
 * nothing lists what its turn opened instead.
 */

/** What the agent opened in the chat: a file, with the lines it read when it read some, or a page. */
export type Opened = {
  target: Exclude<SourceTarget, { kind: "own" }>;
  /** The run it was opened in, and when. */
  runId: string | null;
  at: string;
  /** A page's title, when the search that found it gave one. */
  title?: string;
};

/** One row of the list. A source the agent cited keeps its target as the agent wrote it. */
export type AnswerReference = {
  readonly n: number;
  readonly target: SourceTarget;
  readonly opened: "this turn" | "earlier in this chat" | "not opened" | "own knowledge";
  /** A web page's title, when something that opened it gave one. */
  readonly title?: string;
};

type OpenedTarget = Opened["target"];

const fileTarget = (path: string, lines: [number, number] | null): OpenedTarget => ({
  kind: "file",
  path,
  lines,
  heading: null,
});

/**
 * A path as paths are compared: forward slashes, with no leading `./`, no doubled `/` and no
 * trailing `/`.
 */
export function normalizePath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/$/, "");
}

/**
 * The agent cites paths relative to its folder, and Claude's Read gives absolute ones: two paths
 * are one file when they are equal, or one is the other under a folder.
 */
function pathsMatch(a: string, b: string): boolean {
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

/** An address as addresses are compared: parsed, so the host's case goes, and without its fragment. */
function addressKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    const hash = url.indexOf("#");
    return hash < 0 ? url : url.slice(0, hash);
  }
}

const sourceKey = (target: OpenedTarget) =>
  target.kind === "file" ? normalizePath(target.path) : addressKey(target.url);

// --- Codex reads files through the shell ----------------------------------------------------

/** What makes a command more than one program reading one file, when it is not in quotes. */
const SHELL_SYNTAX = /[|&;<>()$`*?[]/;
const SHELL_WRAPPER = /(?:^|\/)(?:bash|sh|zsh)$/;

/**
 * A command's words, with their quotes taken off; null for a command that is more than words: a
 * pipe, a list, a redirect, an expansion, a glob, a second line or an unfinished quote.
 */
function shellWords(command: string): string[] | null {
  const words: string[] = [];
  let word = "";
  let started = false;
  let quote: string | null = null;
  const endWord = () => {
    if (started) words.push(word);
    word = "";
    started = false;
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command.charAt(index);
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
    } else if (quote === '"') {
      const next = command.charAt(index + 1);
      if (char === '"') quote = null;
      else if (char === "$" || char === "`") return null;
      else if (char === "\\" && next !== "" && '"\\$`'.includes(next)) {
        word += next;
        index += 1;
      } else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === "\\") {
      if (index + 1 >= command.length) return null;
      index += 1;
      word += command.charAt(index);
      started = true;
    } else if (char === "\n" || char === "\r") {
      return null;
    } else if (/\s/.test(char)) {
      endWord();
    } else if (SHELL_SYNTAX.test(char)) {
      return null;
    } else {
      word += char;
      started = true;
    }
  }
  if (quote !== null) return null;
  endWord();
  return words;
}

/** The command's words, one shell layer unwrapped: `/bin/zsh -lc "cat a.md"` is `cat a.md`. */
function commandWords(command: string): string[] | null {
  const words = shellWords(command.trim());
  if (words === null || words.length !== 3) return words;
  const [shell = "", flag, script = ""] = words;
  return SHELL_WRAPPER.test(shell) && (flag === "-c" || flag === "-lc")
    ? shellWords(script.trim())
    : words;
}

/** The options of each program that take the next word as their value. */
const VALUE_OPTIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["cat", new Set<string>()],
  ["nl", new Set(["-b", "-d", "-f", "-h", "-i", "-l", "-n", "-s", "-v", "-w"])],
  ["head", new Set(["-n", "-c"])],
  ["tail", new Set(["-n", "-c"])],
]);
const SED_RANGE = /^(\d+)(?:,(\d+))?p$/;
const HEAD_COUNT = /^-n?(\d+)$/;

type FileRead = { path: string; lines: [number, number] | null };

/** The first `count` lines, when it names some. */
const firstLines = (count: string | undefined): [number, number] | null =>
  count !== undefined && /^\d+$/.test(count) && Number(count) >= 1 ? [1, Number(count)] : null;

/** The lines `head` prints, from `-n N`, `-nN` or `-N`; all of them without. */
function headLines(args: ReadonlyArray<string>): [number, number] | null {
  for (const [index, arg] of args.entries()) {
    if (arg === "-n") return firstLines(args[index + 1]);
    const attached = HEAD_COUNT.exec(arg)?.[1];
    if (attached !== undefined) return firstLines(attached);
  }
  return null;
}

/** `sed -n 'A,Bp' FILE`, or `sed -n 'Ap' FILE`. */
function readSed(args: ReadonlyArray<string>): FileRead | null {
  const [flag, script = "", path = ""] = args;
  const range = SED_RANGE.exec(script);
  if (flag !== "-n" || args.length !== 3 || range === null) return null;
  if (path === "" || path.startsWith("-")) return null;
  const from = Number(range[1]);
  const to = Number(range[2] ?? range[1]);
  return from >= 1 && from <= to ? { path, lines: [from, to] } : null;
}

/**
 * A command that reads one file and does nothing else: `cat`, `nl`, `head` or `tail` with any
 * flags, or `sed -n` printing a range of lines. The lines are known for `head -n N` and `sed`.
 */
function readCommand(command: string): FileRead | null {
  const [program = "", ...args] = commandWords(command) ?? [];
  if (program === "sed") return readSed(args);
  const valued = VALUE_OPTIONS.get(program);
  if (valued === undefined) return null;
  const files: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (valued.has(arg)) index += 1;
    else if (!arg.startsWith("-") || arg === "-") files.push(arg);
  }
  const [path = "-"] = files;
  if (files.length !== 1 || path === "-") return null;
  return { path, lines: program === "head" ? headLines(args) : null };
}

// --- What a tool item opened ----------------------------------------------------------------

type ItemOpening = { target: OpenedTarget; title?: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const nonBlank = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const isLineNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

/** Claude's Read gives `offset` and `limit` together for a part of a file. */
function claudeReadLines(input: Record<string, unknown>): [number, number] | null {
  const { offset, limit } = input;
  return isLineNumber(offset) && isLineNumber(limit) ? [offset, offset + limit - 1] : null;
}

/**
 * Claude's `Read` names its file `file_path`. The adapters of the other providers report their
 * reads as a `Read` too, with the path under `path` or `filePath`; of those, only the path is known.
 */
function readOpenings(input: Record<string, unknown>): ItemOpening[] {
  const claudePath = nonBlank(input.file_path);
  const path = claudePath ?? nonBlank(input.filePath) ?? nonBlank(input.path);
  if (path === null) return [];
  return [{ target: fileTarget(path, claudePath === null ? null : claudeReadLines(input)) }];
}

function toolOpenings(toolName: string | null, input: unknown): ItemOpening[] {
  const args = asRecord(input);
  if (args === null) return [];
  if (toolName !== null && /^read$/i.test(toolName)) return readOpenings(args);
  // The text-to-cad plugin's viewer tools, by their name after any server or plugin prefix.
  if (toolName !== null && /cad_(?:open|show)$/.test(toolName)) {
    const path = nonBlank(args.path);
    return path === null ? [] : [{ target: fileTarget(path, null) }];
  }
  return [];
}

/**
 * The pages a web search or fetch opened: each result with an address, and each pattern that is
 * one (Claude's WebFetch names its page there; Codex's patterns are otherwise search words).
 */
function pageOpenings(item: Extract<OrchestrationV2TurnItem, { type: "web_search" }>) {
  const pages = new Map<string, ItemOpening>();
  const add = (url: string, title: string | null) => {
    const key = addressKey(url);
    if (!pages.has(key)) {
      pages.set(key, { target: { kind: "url", url }, ...(title === null ? {} : { title }) });
    }
  };
  for (const result of item.results ?? []) {
    if (result.url !== undefined) add(result.url, nonBlank(result.title));
  }
  for (const pattern of item.patterns ?? []) {
    const address = pattern.trim();
    if (/^https?:\/\//i.test(address)) add(address, null);
  }
  return [...pages.values()];
}

/** What a turn item opened, when it ran: a call that failed or was stopped opened nothing. */
function itemOpenings(item: OrchestrationV2TurnItem): ItemOpening[] {
  if (item.status === "failed" || item.status === "cancelled" || item.status === "interrupted") {
    return [];
  }
  switch (item.type) {
    case "dynamic_tool":
      return toolOpenings(item.toolName, item.input);
    case "file_search":
      return (item.results ?? []).map((result) => ({
        target: fileTarget(
          result.fileName,
          result.line === undefined ? null : [result.line, result.line],
        ),
      }));
    case "web_search":
      return pageOpenings(item);
    case "command_execution": {
      const read = readCommand(item.input);
      return read === null ? [] : [{ target: fileTarget(read.path, read.lines) }];
    }
    default:
      return [];
  }
}

// --- Reading the chat -----------------------------------------------------------------------

interface ChatOpening {
  readonly opened: Opened;
  /** The normalized path or address it is compared by. */
  readonly key: string;
  /** Where its entry sits in the chat. */
  readonly position: number;
}

interface ChatScan {
  readonly opened: ReadonlyArray<Opened>;
  readonly openings: ReadonlyArray<ChatOpening>;
  readonly openingsByRun: ReadonlyMap<string, ReadonlyArray<ChatOpening>>;
  /** Where each run's first entry sits in the chat. */
  readonly firstEntryOfRun: ReadonlyMap<string, number>;
  readonly size: number;
}

function entryRunId(entry: TimelineEntry): string | null {
  switch (entry.kind) {
    case "message":
      return entry.message.runId;
    case "work":
      return entry.entry.runId ?? null;
    case "html-render":
    case "mcp-app":
      return entry.runId;
    case "event":
      return entry.projectedItem.item.runId;
    case "proposed-plan":
      return entry.proposedPlan.runId;
  }
}

/** Each answer of a derive pass asks the same chat, so it is read once per array of entries. */
const scans = new WeakMap<ReadonlyArray<TimelineEntry>, ChatScan>();

function scanChat(entries: ReadonlyArray<TimelineEntry>): ChatScan {
  const known = scans.get(entries);
  if (known !== undefined) return known;
  const openings: ChatOpening[] = [];
  const openingsByRun = new Map<string, ChatOpening[]>();
  const firstEntryOfRun = new Map<string, number>();
  for (const [position, entry] of entries.entries()) {
    const runId = entryRunId(entry);
    if (runId !== null && !firstEntryOfRun.has(runId)) firstEntryOfRun.set(runId, position);
    if (entry.kind !== "work" || entry.entry.structuredPayload === undefined) continue;
    for (const { target, title } of itemOpenings(entry.entry.structuredPayload)) {
      const opening: ChatOpening = {
        opened: {
          target,
          runId,
          at: entry.entry.createdAt,
          ...(title === undefined ? {} : { title }),
        },
        key: sourceKey(target),
        position,
      };
      openings.push(opening);
      if (runId === null) continue;
      const ofRun = openingsByRun.get(runId);
      if (ofRun === undefined) openingsByRun.set(runId, [opening]);
      else ofRun.push(opening);
    }
  }
  const scan = {
    opened: openings.map((opening) => opening.opened),
    openings,
    openingsByRun,
    firstEntryOfRun,
    size: entries.length,
  };
  scans.set(entries, scan);
  return scan;
}

/**
 * What the agent opened in the chat, in the order it did: Claude's Read, the CAD viewer's
 * `cad_open` and `cad_show`, file searches, the pages of web searches, and the reads Codex makes
 * through the shell (`cat`, `nl`, `head`, `tail` or `sed -n` on one file, and nothing cleverer).
 * It reads the chat's tool items, which a collapsed turn still holds.
 */
export function openedInChat(entries: ReadonlyArray<TimelineEntry>): ReadonlyArray<Opened> {
  return scanChat(entries).opened;
}

// --- Marking a citation ---------------------------------------------------------------------

function sameSource(opening: ChatOpening, cited: OpenedTarget, key: string): boolean {
  if (opening.opened.target.kind !== cited.kind) return false;
  return cited.kind === "file" ? pathsMatch(opening.key, key) : opening.key === key;
}

/**
 * A cited source is opened this turn when the run opened it, else earlier in this chat when an
 * entry before the run's first one did. What later runs opened does not count for it, and an
 * answer with no run has no this turn: what the chat opened is earlier.
 */
function markSource(
  scan: ChatScan,
  runId: string | null,
  before: number,
  source: { n: number; target: SourceTarget },
): AnswerReference {
  const { n, target } = source;
  if (target.kind === "own") return { n, target, opened: "own knowledge" };
  const key = sourceKey(target);
  let opened: AnswerReference["opened"] = "not opened";
  let title: string | undefined;
  for (const opening of scan.openings) {
    if (!sameSource(opening, target, key)) continue;
    if (runId !== null && opening.opened.runId === runId) {
      opened = "this turn";
    } else if (opening.position < before) {
      if (opened === "not opened") opened = "earlier in this chat";
    } else {
      continue;
    }
    title ??= opening.opened.title;
  }
  return { n, target, opened, ...(title === undefined ? {} : { title }) };
}

/**
 * An answer that cites nothing: what its turn opened that is the project's work, once each, in the
 * order it was opened. The agent's own skill and tool docs, which live in hidden folders, are not.
 */
function thisTurnsOpenings(scan: ChatScan, runId: string | null): AnswerReference[] {
  const references: AnswerReference[] = [];
  const seen = new Set<string>();
  const thisRun = runId === null ? undefined : scan.openingsByRun.get(runId);
  for (const { opened, key } of thisRun ?? []) {
    if (seen.has(key)) continue;
    if (opened.target.kind === "file" && classifyProjectFile(key) === null) continue;
    seen.add(key);
    references.push({
      n: references.length + 1,
      target: opened.target,
      opened: "this turn",
      ...(opened.title === undefined ? {} : { title: opened.title }),
    });
  }
  return references;
}

/**
 * The list under an answer: the sources it cites, each with when the agent opened it, or, for an
 * answer with no Sources block, what its turn opened.
 */
export function turnReferences(input: {
  answer: string;
  runId: string | null;
  entries: ReadonlyArray<TimelineEntry>;
}): AnswerReference[] {
  const { runId } = input;
  const { sources } = splitSources(input.answer);
  const scan = scanChat(input.entries);
  if (sources.length === 0) return thisTurnsOpenings(scan, runId);
  // A run the chat does not hold comes after everything it does.
  const before = (runId === null ? undefined : scan.firstEntryOfRun.get(runId)) ?? scan.size;
  return sources.map((source) => markSource(scan, runId, before, source));
}

// --- Comparing and describing the list ------------------------------------------------------

const linesEqual = (a: [number, number] | null, b: [number, number] | null) =>
  a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1]);

function targetsEqual(a: SourceTarget, b: SourceTarget): boolean {
  switch (a.kind) {
    case "file":
      return (
        b.kind === "file" &&
        a.path === b.path &&
        a.heading === b.heading &&
        linesEqual(a.lines, b.lines)
      );
    case "url":
      return b.kind === "url" && a.url === b.url;
    case "own":
      return b.kind === "own" && a.text === b.text;
  }
}

/**
 * Whether two lists say the same, for a row to keep what it has when the chat is read again:
 * every derive pass builds the list anew.
 */
export function referencesEqual(
  a: ReadonlyArray<AnswerReference> | undefined,
  b: ReadonlyArray<AnswerReference> | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      item.n === other.n &&
      item.opened === other.opened &&
      item.title === other.title &&
      targetsEqual(item.target, other.target)
    );
  });
}

const linesPhrase = ([from, to]: [number, number]) =>
  from === to ? `line ${from}` : `lines ${from}–${to}`;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

/**
 * A row's words: what it is called and where in it. A file is called what Studio calls it
 * elsewhere (a part by its name, else its file name) and sits at its lines or its heading; a page
 * is called by its title, else its host, and a titled page sits at its host.
 */
export function referenceLabel(reference: AnswerReference): { name: string; where: string | null } {
  const { target, title } = reference;
  switch (target.kind) {
    case "file": {
      const path = normalizePath(target.path);
      return {
        name: classifyProjectFile(path)?.title ?? (path.split("/").at(-1) || path),
        where: target.lines === null ? target.heading : linesPhrase(target.lines),
      };
    }
    case "url": {
      const host = hostOf(target.url);
      return title === undefined ? { name: host, where: null } : { name: title, where: host };
    }
    case "own":
      return { name: target.text === "" ? "Own knowledge" : target.text, where: null };
  }
}
