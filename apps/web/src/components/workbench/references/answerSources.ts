/**
 * The Sources block that ends an answer about a project. The agent is told to write it
 * (`studioProjectContext`): a line reading `Sources:`, then one source a line, numbered as the
 * answer cites them, as in `[1] parts/bracket.py:12-18`. `splitSources` reads it back, so the
 * answer can show without the block and its sources be listed under it.
 */

export type SourceTarget =
  | { kind: "file"; path: string; lines: [number, number] | null; heading: string | null }
  | { kind: "url"; url: string }
  | { kind: "own"; text: string };

/** `Sources:` as models also write it: in bold or italics, as a heading, the colon in or out. */
const SOURCES_LINE = /^(?:#{1,6}[ \t]+)?(\*{1,3}|_{1,3})?Sources(?::\1|\1:?)$/;
const LIST_BULLET = /^[-*]\s+/;
/** `[3] parts/bracket.py:12-18`. The space keeps a link, `[3](https://…)`, from reading as one. */
const SOURCE_ENTRY = /^\[(\d+)\]\s+(\S.*)$/;
/** What may follow a target: `parts/bracket.py:12-18 — the hole pattern`. */
const DESCRIPTION = / [—–-] /;
/** A target in backticks or angle brackets is taken whole: a file name can hold ` - `. */
const WRAPPED_TARGET = /^(?:`([^`]*)`|<([^>]*)>)(?: [—–-] .*)?$/;
/**
 * `[title](address)`, taken whole too. The address can hold parentheses (`Torx_(screw_drive)`),
 * so it ends at the first `)` that a space or the end of the line follows.
 */
const MARKDOWN_LINK = /^\[[^\]]*\]\((\S+?)\)(?=\s|$)/;
const OWN_KNOWLEDGE = /^own knowledge\b\s*:?/i;
const WEB_ADDRESS = /^https?:\/\/\S+/i;
const PATH_WITH_HEADING = /^([^#]*)#(.*)$/;
const PATH_WITH_LINES = /^(.*?):(\d+)(?:-(\d+))?$/;

/** The target alone: what is inside its marks, or what comes before a description. */
function targetOf(text: string): string {
  const wrapped = WRAPPED_TARGET.exec(text);
  if (wrapped !== null) return (wrapped[1] ?? wrapped[2] ?? "").trim();
  return (text.split(DESCRIPTION, 1)[0] ?? "").trim();
}

/** A file with no path is no source. */
function fileTarget(
  path: string,
  lines: [number, number] | null,
  heading: string | null,
): SourceTarget | null {
  const name = path.trim();
  return name === "" ? null : { kind: "file", path: name, lines, heading };
}

function readFileTarget(target: string): SourceTarget | null {
  const titled = PATH_WITH_HEADING.exec(target);
  if (titled !== null) return fileTarget(titled[1] ?? "", null, (titled[2] ?? "").trim() || null);
  const ranged = PATH_WITH_LINES.exec(target);
  if (ranged === null) return fileTarget(target, null, null);
  const [, path = "", first = "", last = first] = ranged;
  const from = Number(first);
  const to = Number(last);
  return fileTarget(path, [Math.min(from, to), Math.max(from, to)], null);
}

/** One source's target as written after its number; null when nothing there can be a source. */
function readTarget(text: string): SourceTarget | null {
  const link = MARKDOWN_LINK.exec(text)?.[1];
  if (link !== undefined) return { kind: "url", url: link };
  const target = targetOf(text);
  if (OWN_KNOWLEDGE.test(target)) {
    return { kind: "own", text: target.replace(OWN_KNOWLEDGE, "").trim() };
  }
  const address = WEB_ADDRESS.exec(target)?.[0];
  if (address !== undefined) return { kind: "url", url: address };
  return readFileTarget(target);
}

/**
 * The answer without its Sources block, and the block's sources in the order written. The block
 * is the message's last: the last Sources line and the lines under it, each a source. A Sources
 * line with anything else under it is part of the answer, which comes back as it is. A line of
 * the block that cannot be read is dropped, and so is a number that repeats.
 */
export function splitSources(markdown: string): {
  body: string;
  sources: Array<{ n: number; target: SourceTarget }>;
} {
  const whole = { body: markdown, sources: [] };
  const lines = markdown.split("\n");
  const header = lines.findLastIndex((line) => SOURCES_LINE.test(line.trim()));
  if (header < 0) return whole;
  const block = lines
    .slice(header + 1)
    .map((line) => line.trim().replace(LIST_BULLET, ""))
    .filter((line) => line !== "");
  if (!block.every((line) => line.startsWith("["))) return whole;
  const sources: Array<{ n: number; target: SourceTarget }> = [];
  for (const line of block) {
    const entry = SOURCE_ENTRY.exec(line);
    if (entry === null) continue;
    const n = Number(entry[1]);
    const target = readTarget(entry[2] ?? "");
    if (n > 0 && target !== null && !sources.some((source) => source.n === n)) {
      sources.push({ n, target });
    }
  }
  return { body: lines.slice(0, header).join("\n").trimEnd(), sources };
}
