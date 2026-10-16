/**
 * Edit mode's rules, pure: how a part's history, sizes and dimensions read in the viewer
 * (`cadgen/edit` reads them from the part's script), what the note of a hand change says, and the
 * undo history of hand changes.
 */

const ACRONYMS = new Set(["id", "od", "pcb", "usb", "led", "cnc", "fdm", "sla"]);
const UNIT_WORDS = Object.freeze({ mm: "Millimeters", in: "Inches", cm: "Centimeters", m: "Meters" });
const UNIT_MARKS = Object.freeze({ mm: "mm", in: "in", cm: "cm", m: "m" });
// The tracer's kinds, in the words a CAD tree uses for them.
const KIND_NAMES = Object.freeze({ Join: "Combine", Move: "Move", Cut: "Cut", Intersect: "Intersect" });
const HISTORY_LIMIT = 50;

/** A size's name as an engineer says it: `TRAY_HEIGHT` reads "Tray height"; a bare number stays as written. */
export function sizeName(name) {
  const text = String(name ?? "");
  if (!/^[A-Za-z_]\w*$/.test(text)) return text;
  const words = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[_\s]+/).filter(Boolean);
  if (!words.length) return text;
  const cased = words.map(word => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.length === 1 ? word.toUpperCase() : word.toLowerCase()));
  return cased[0].charAt(0).toUpperCase() + cased[0].slice(1) + (cased.length > 1 ? ` ${cased.slice(1).join(" ")}` : "");
}

/** The project's units in words, for the ribbon: "Inches". */
export const unitWord = units => UNIT_WORDS[units] || String(units || "");

/** A value with its unit as the panels show it: "2.80 in"; an angle or a count keeps its own. */
export function withUnit(text, unit) {
  const mark = UNIT_MARKS[unit] || unit || "";
  return mark ? `${text} ${mark}` : String(text);
}

/**
 * Each feature of the history named as a CAD tree names it, its kind numbered in order
 * ("Extrude1", "Fillet1", "Extrude2"), with the name its script gives it as words ("Cavity") beside.
 */
export function featureNames(rows = []) {
  const counts = new Map();
  return rows.map(row => {
    const kind = KIND_NAMES[row.kind] || row.kind || "Feature";
    const count = (counts.get(kind) || 0) + 1;
    counts.set(kind, count);
    return { key: row.key, kind, title: `${kind}${count}`, name: row.name ? sizeName(row.name) : "" };
  });
}

/** The dimensions a feature draws on the model. */
export const rowDimensions = (state, rowKey) => (state?.dimensions || []).filter(dimension => dimension.row === rowKey);

/** The feature edit mode opens on: the first that draws dimensions (the part's base), else the first. */
export function defaultRow(state) {
  const drawn = new Set((state?.dimensions || []).map(dimension => dimension.row));
  return state?.rows?.find(row => drawn.has(row.key))?.key ?? state?.rows?.[0]?.key ?? null;
}

/** Whether a formula only restates its value ("20" for 20), so a panel shows it once. */
export const restates = (formula, display) => !formula || String(formula).replace(/\s+/g, "") === String(display ?? "").replace(/\s+/g, "");

/** The formula behind a value, its sizes in words: `LENGTH-2*WALL` reads "Length - 2 × Wall". */
export function formulaWords(formula) {
  return String(formula || "")
    .replace(/[A-Za-z_]\w*/g, name => sizeName(name))
    .replace(/\s*([+\-/])\s*/g, " $1 ")
    .replace(/\s*\*\s*/g, " × ")
    .replace(/\s+/g, " ")
    .trim();
}

/** What a hand change tells the agent, queued for the person's next message: plain words, the line in parens. */
export function changeNote(change) {
  const name = sizeName(change.name);
  const said = name === change.name ? name : `${name} (${change.name})`;
  return `In edit mode I changed ${said} from ${change.from} to ${change.to} (${change.file}, line ${change.line}).`;
}

/** Where a build of the parts that use a change stands, in a line; empty when it is done. */
export function buildingText(building) {
  if (!building || !building.scripts?.length) return "";
  if (building.error) return "A STEP file did not rebuild";
  if (building.done < building.scripts.length) return `Updating STEP files, ${building.done} of ${building.scripts.length}`;
  return "";
}

/** The hand changes of this view, for Undo and Redo. */
export const emptyHistory = () => ({ done: [], undone: [] });

/** A change made by hand: Undo may take it back, and nothing undone can be redone after it. */
export const recordChange = (history, change) => ({ done: [...history.done, change].slice(-HISTORY_LIMIT), undone: [] });

/** Undo: the last change, and the request that writes its number back. */
export function undoStep(history) {
  const change = history.done.at(-1);
  if (!change) return null;
  return { request: { literal: change.literal, text: change.from },
    next: { done: history.done.slice(0, -1), undone: [...history.undone, change] } };
}

/** Redo: the last change undone, and the request that writes it again. */
export function redoStep(history) {
  const change = history.undone.at(-1);
  if (!change) return null;
  return { request: { literal: change.literal, text: change.to },
    next: { done: [...history.done, change], undone: history.undone.slice(0, -1) } };
}
