/**
 * A project's README as its Overview reads it (`ReadmeOverview.tsx`): the title, "What it is",
 * and "Decisions", one line each, which the agent keeps as it works (`studioProjectContext`):
 * `- <what was decided> (<YYYY-MM-DD>, asked)`, or `by hand` for a change made by hand.
 */

export interface ReadmeDecision {
  readonly text: string;
  readonly when: string | null;
  readonly how: "asked" | "by hand" | null;
}

export interface ReadmeSections {
  readonly title: string | null;
  readonly whatItIs: string | null;
  readonly decisions: ReadonlyArray<ReadmeDecision>;
}

function readDecision(item: string): ReadmeDecision {
  const plain = { text: item.trim(), when: null, how: null };
  const match = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(item);
  if (match === null) return plain;
  const notes = (match[2] ?? "").split(",").map((note) => note.trim().toLowerCase());
  const when = notes.find((note) => /^\d{4}-\d{2}-\d{2}$/.test(note)) ?? null;
  const how = notes.includes("by hand") ? "by hand" : notes.includes("asked") ? "asked" : null;
  return when === null && how === null ? plain : { text: (match[1] ?? "").trim(), when, how };
}

export function readmeSections(markdown: string | null): ReadmeSections {
  const empty: ReadmeSections = { title: null, whatItIs: null, decisions: [] };
  if (markdown === null || markdown.trim() === "") return empty;
  let title: string | null = null;
  const intro: string[] = [];
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading?.[1] === "#" && title === null && current === null) {
      title = heading[2] ?? null;
      continue;
    }
    if (heading?.[1] === "##") {
      current = [];
      sections.set((heading[2] ?? "").trim().toLowerCase(), current);
      continue;
    }
    (current ?? intro).push(line);
  }
  const text = (lines: ReadonlyArray<string> | undefined) =>
    lines === undefined ? null : lines.join("\n").trim() || null;
  const decisions = (sections.get("decisions") ?? []).flatMap((line) => {
    const item = /^\s*[-*]\s+(.+)$/.exec(line)?.[1];
    return item === undefined ? [] : [readDecision(item)];
  });
  return { title, whatItIs: text(sections.get("what it is")) ?? text(intro), decisions };
}
