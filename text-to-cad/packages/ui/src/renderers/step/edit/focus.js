/**
 * Where the host's ask to show a line of a part's script lands (Studio's References open a part at the line an answer
 * cites, `tab-store/focusHost.ts`): the feature of the Part Navigator whose statement holds the line, and when the part on
 * screen can answer the ask.
 */

const slashed = path => String(path ?? "").replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");

/** Whether two paths name one script: the same, or one the other's tail at a folder's edge, however each is written. */
function sameScript(a, b) {
  const left = slashed(a), right = slashed(b);
  return Boolean(left && right) && (left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`));
}

/**
 * The feature whose statement holds a line of a script (`file`, as the host names it), among the Part Navigator's
 * features (`featureTree`'s, a part's or every part's of an assembly); null for none. A feature stands for the statements
 * its `lines` lists, each `{ file, line, text }` by its first line (a list, not a count or an end): its own, then the rows
 * folded into it, the profile it extrudes or a cut joined to it. The engine says no more of a statement than where it
 * starts, so a line no statement starts at holds none: a blank line, a comment, an import, the rest of a statement
 * written over several lines. Where two features stand for one statement (a join folded into both its tools), the
 * innermost is the one whose statements lie closest together.
 */
export function featureAtLine(features, file, line) {
  let found = null, span = Infinity;
  for (const feature of features || []) {
    const lines = (feature.lines || []).filter(each => sameScript(each.file, file)).map(each => each.line);
    if (!lines.includes(line)) continue;
    const width = Math.max(...lines) - Math.min(...lines);
    if (width < span) { found = feature; span = width; }
  }
  return found;
}

// The part's read is still on its way: whether it has a script, its first read, or the AI layout's quiet one.
const READING = new Set(["probing", "reading", "idle"]);

/**
 * How the part on screen answers its host's ask (`focus`, `{ path, line }`), as edit mode stands (`useEditMode`'s
 * `status`, the layout it is shown in, the Part Navigator's `features`): null while the part is still being read, as the
 * answer waits for it; else `{ select }`, the id of the feature whose statement holds the line (`featureAtLine`), or null
 * where none is to be selected. Laid out for the AI the view shows no features; a file with no part script (`none`) and
 * a part whose build failed (`error`) have none read. Every answer lets the ask go, so the host never keeps one.
 */
export function focusAnswer(focus, { layout, status, features }) {
  if (layout !== "manual") return { select: null };
  if (READING.has(status)) return null;
  if (status !== "ready") return { select: null };
  return { select: featureAtLine(features, focus.path, focus.line)?.id ?? null };
}
