/**
 * A project's README as its Overview reads it (`ReadmeOverview.tsx`): the title, "What it is",
 * and "Decisions", one line each, which the agent keeps as it works (`studioProjectContext`):
 * `- <what was decided> (<YYYY-MM-DD>, asked)`, or `by hand` for a change made by hand. A
 * decision written date first (`- 2026-10-19 — ... Source: ...`) reads too, and every other
 * section is kept as written, so whatever the README holds shows.
 */

export interface ReadmeDecision {
  readonly text: string;
  readonly when: string | null;
  readonly how: "asked" | "by hand" | null;
}

/** A section of the README beyond What it is and Decisions: open questions, notes, risks. */
export interface ReadmeSection {
  readonly heading: string;
  readonly paragraphs: ReadonlyArray<string>;
  readonly items: ReadonlyArray<string>;
}

export interface ReadmeSections {
  readonly title: string | null;
  readonly whatItIs: string | null;
  readonly decisions: ReadonlyArray<ReadmeDecision>;
  readonly more: ReadonlyArray<ReadmeSection>;
}

/**
 * What a new project's README starts with (`ManagedProjectFolders.namedProjectReadme` on the
 * server): the project's icon and a line saying where it was made, not what it is.
 */
const STARTING_LINE = /^\s*(<[^>]+>|Created in \[T3 Code\]\([^)]*\)\.?)\s*$/;
const LIST_ITEM = /^\s*[-*]\s+(.+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** `2026-10-19 — what was decided. Source: user brief.` */
const DATE_FIRST = /^(\d{4}-\d{2}-\d{2})\s*(?:[—–:-]\s*)?(.+)$/;
const SOURCE = /\s*Source:\s*([^.]*)\.?\s*$/i;

const withoutStop = (text: string) => text.trim().replace(/\.$/, "");

function readDecision(item: string): ReadmeDecision {
  const plain = { text: item.trim(), when: null, how: null };
  const noted = /^(.*?)\s*\(([^()]*)\)\s*\.?\s*$/.exec(item);
  if (noted !== null) {
    const notes = (noted[2] ?? "").split(",").map((note) => note.trim().toLowerCase());
    const when = notes.find((note) => DATE.test(note)) ?? null;
    const how = notes.includes("by hand") ? "by hand" : notes.includes("asked") ? "asked" : null;
    if (when !== null || how !== null) return { text: (noted[1] ?? "").trim(), when, how };
  }
  const dated = DATE_FIRST.exec(item.trim());
  if (dated === null) return plain;
  const rest = dated[2] ?? "";
  const source = SOURCE.exec(rest);
  if (source === null) return { text: withoutStop(rest), when: dated[1] ?? null, how: null };
  return {
    text: withoutStop(rest.slice(0, source.index)),
    when: dated[1] ?? null,
    how: /hand/i.test(source[1] ?? "") ? "by hand" : "asked",
  };
}

/** A section's lines as its paragraphs (blank-line separated) and its list items. */
function readSection(heading: string, lines: ReadonlyArray<string>): ReadmeSection {
  const paragraphs: string[] = [];
  const items: string[] = [];
  let paragraph: string[] = [];
  const close = () => {
    const text = paragraph.join(" ").trim();
    if (text !== "") paragraphs.push(text);
    paragraph = [];
  };
  for (const line of lines) {
    const item = LIST_ITEM.exec(line)?.[1];
    if (item !== undefined) {
      close();
      items.push(item.trim());
    } else if (line.trim() === "") close();
    else paragraph.push(line.trim());
  }
  close();
  return { heading, paragraphs, items };
}

export function readmeSections(markdown: string | null): ReadmeSections {
  const empty: ReadmeSections = { title: null, whatItIs: null, decisions: [], more: [] };
  if (markdown === null || markdown.trim() === "") return empty;
  let title: string | null = null;
  const intro: string[] = [];
  const sections: Array<{ readonly heading: string; readonly lines: string[] }> = [];
  let current: string[] | null = null;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading?.[1] === "#" && title === null && current === null) {
      title = heading[2] ?? null;
      continue;
    }
    if (heading?.[1] === "##") {
      current = [];
      sections.push({ heading: (heading[2] ?? "").trim(), lines: current });
      continue;
    }
    (current ?? intro).push(line);
  }
  const named = (name: string) =>
    sections.find((section) => section.heading.toLowerCase() === name)?.lines;
  const text = (lines: ReadonlyArray<string> | undefined) =>
    lines === undefined ? null : lines.join("\n").trim() || null;
  const decisions = (named("decisions") ?? []).flatMap((line) => {
    const item = LIST_ITEM.exec(line)?.[1];
    return item === undefined ? [] : [readDecision(item)];
  });
  const more = sections
    .filter(({ heading }) => !["what it is", "decisions"].includes(heading.toLowerCase()))
    .map(({ heading, lines }) => readSection(heading, lines))
    .filter((section) => section.paragraphs.length > 0 || section.items.length > 0);
  const opening = intro.filter((line) => !STARTING_LINE.test(line));
  return { title, whatItIs: text(named("what it is")) ?? text(opening), decisions, more };
}

export type ReadmeInline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly target: string }
  | { readonly kind: "strong"; readonly text: string };

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

/**
 * A line of README text in the pieces the Overview shows: plain text, links (a file of the
 * project, or a web page) and bold. Code marks drop away; the words stay.
 */
export function readmeInline(text: string): ReadonlyArray<ReadmeInline> {
  const pieces: ReadmeInline[] = [];
  const addText = (more: string) => {
    if (more === "") return;
    const previous = pieces.at(-1);
    if (previous?.kind === "text")
      pieces[pieces.length - 1] = { kind: "text", text: previous.text + more };
    else pieces.push({ kind: "text", text: more });
  };
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    addText(text.slice(last, at));
    const [whole, label, target, strong, code] = match;
    if (label !== undefined && target !== undefined)
      pieces.push({ kind: "link", text: label, target });
    else if (strong !== undefined) pieces.push({ kind: "strong", text: strong });
    else addText(code ?? "");
    last = at + whole.length;
  }
  addText(text.slice(last));
  return pieces;
}
