/**
 * Command search, the box S opens: any CAD command found by name, as Fusion's shortcut box and NX's
 * Command Finder find one. Pure. It says what is listed and in what order (`CommandSearchBox.jsx` draws
 * it, and `EditRibbon.jsx` hands it the buttons the toolbar has, which it lists no more than).
 *
 * A command is found by the name the toolbar gives it (NX's: Edge Blend), then by the words other
 * tools have for it (fillet, round). A query is read word by word, in any case: each of its words
 * must begin a word of the name, or of one of those words, so "pat" finds Pattern Feature and
 * "ect" finds nothing. Commands found by their name come before those found by another tool's
 * word, each in the toolbar's order.
 */
import { editCommand } from "./editMode.js";
import { SOLID_GROUPS, booleanOf, nxCommand } from "./nx.js";
import { SKETCH_ENTITIES, SKETCH_FAMILIES, SKETCH_MODIFY, sketchTool } from "./sketchMode.js";

const frozen = words => Object.freeze(Object.fromEntries(Object.entries(words).map(([id, list]) => [id, Object.freeze(list)])));

/**
 * The words other tools use for a command or tool of the Solid tab, by its id: SolidWorks' and Fusion's
 * for what NX names otherwise ("fillet" finds Edge Blend, "pocket" an Extrude with Subtract). What SolidWorks
 * called each modeling command (`EDIT_COMMANDS`' labels: Extruded Cut, Lofted Boss/Base) is found too.
 */
export const COMMAND_WORDS = frozen({
  fillet: ["fillet", "round", "blend"], chamfer: ["bevel"], extrude: ["boss", "pad", "pull"],
  cut: ["cut", "pocket", "extruded cut"], revolve: ["lathe", "turn"], revolve_cut: ["groove"], loft: ["loft", "lofted"], sweep: ["swept"],
  hole: ["drill", "tap", "thread"], pattern: ["array", "copy"], mirror: ["symmetry"], shell: ["hollow"], draft: ["taper"], rib: ["web"],
  split: ["split body"], delete_body: ["remove body", "keep body"],
  offset_face: ["press pull", "push pull", "offset face", "move face"], delete_face: ["remove face", "defeature"],
  plane: ["datum", "work plane", "construction plane", "offset plane"], sketch: ["draw", "profile"], measure: ["distance"],
  clip: ["section", "cross section", "section analysis"],
});

/** The same for the toolbar's other buttons (Inspect, Assemble, Drafting, and the sketch's), by their ids. */
export const TOOLBAR_WORDS = frozen({
  mass: ["mass properties", "weight", "volume"], interference: ["interference detection", "clash"], "normal-to": ["normal to", "look at"],
  appearance: ["appearance", "color"], expressions: ["parameters", "equations"], mate: ["mate"], "make-drawing": ["new drawing", "drawing"],
  exit: ["exit sketch"], normal: ["normal to", "look at"], construction: ["construction geometry"], dimension: ["smart dimension"],
  centerline: ["centerline"], convert: ["convert entities"], offset: ["offset entities"], trim: ["trim entities"],
});

// The Solid tab's buttons that are not modeling commands, and what each of the other tabs adds (the Inspect tab's, then Assemble's,
// then Drafting's), in the toolbar's order, under the names `EditRibbon.jsx` gives them. Select and the agent's buttons are no CAD command.
const SOLID_BUTTONS = Object.freeze({ sketch: "Sketch", measure: "Measure", clip: "Edit Section" });
const TAB_BUTTONS = Object.freeze([
  ["mass", "Measure Bodies"], ["draft-analysis", "Draft Analysis"], ["interference", "Simple Interference"], ["compare", "Compare"],
  ["normal-to", "Orient View"], ["appearance", "Edit Object Display"], ["expressions", "Expressions"],
  ["mate", "Assembly Constraints"], ["exploded", "Exploded Views"],
  ["drawing", "Drawing"], ["edit-sheet", "Edit Sheet"], ["make-drawing", "New Sheet"],
]);

const capitalized = word => word.charAt(0).toUpperCase() + word.slice(1);
const entry = (id, label, { detail = null, words = [] } = {}) => ({ id, label, detail, words: [...(COMMAND_WORDS[id] || []), ...words, ...(TOOLBAR_WORDS[id] || [])] });

// A modeling command: its NX name, with its Boolean when it takes material away (NX sets it in the dialog of the command that adds).
function commandEntry(command) {
  const boolean = booleanOf(command.id);
  return entry(command.id, nxCommand(command), { detail: boolean?.value === "subtract" ? capitalized(boolean.value) : null, words: [command.label] });
}

// The Solid tab's buttons in its order, a command's Subtract just after it, then the other tabs' buttons.
function workspaceEntries() {
  const entries = [];
  for (const id of SOLID_GROUPS.flatMap(group => group.items)) {
    const command = editCommand(id);
    if (command) {
      entries.push(commandEntry(command));
      const boolean = booleanOf(id);
      if (boolean?.value === "unite") entries.push(commandEntry(editCommand(boolean.other)));
    } else if (SOLID_BUTTONS[id]) {
      entries.push(entry(id, SOLID_BUTTONS[id]));
    }
  }
  for (const [id, label] of TAB_BUTTONS) entries.push(entry(id, label));
  return entries;
}

// A sketch's toolbar: Finish Sketch, the curves to draw and edit (a family's flyout after its first tool), Rapid Dimension and
// Convert To/From Reference, as `EditRibbon.jsx` lays them out.
function sketchEntries() {
  const tools = ids => ids.flatMap(id => SKETCH_FAMILIES[id] || [id]).map(id => entry(id, sketchTool(id).label));
  return [entry("exit", "Finish Sketch"), entry("normal", "Orient View to Sketch"), ...tools(SKETCH_ENTITIES), ...tools(SKETCH_MODIFY),
    ...tools(["dimension"]), entry("construction", "Convert To/From Reference")];
}

const WORKSPACE = Object.freeze(workspaceEntries());
const SKETCH = Object.freeze(sketchEntries());
// Fillet, Chamfer and Mirror are a sketch's own tools while it is open: the sketch has no Edge Blend, and a tool stands for the id.
const SKETCH_IDS = new Set(SKETCH.map(each => each.id));
const WHILE_SKETCHING = Object.freeze([...SKETCH, ...WORKSPACE.filter(each => !SKETCH_IDS.has(each.id))]);

const wordsOf = text => String(text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const begins = (text, queried) => { const words = wordsOf(text); return queried.every(word => words.some(each => each.startsWith(word))); };

/**
 * The commands a query finds, each `{ id, label, detail }`: its name in the toolbar (NX's), and the Boolean
 * that tells a cut from the Extrude it is a Subtract of (`detail`, else null). Nothing typed lists them all,
 * in the toolbar's order: the Solid tab's, then what Inspect, Assemble and Drafting add. With a sketch open
 * (`sketching`) its tools come first, then the same, a sketch's Fillet, Chamfer and Mirror standing in for the
 * modeling commands of those ids. `labels` is the toolbar's name for a button where it varies (`{ sketch: "Edit Sketch" }`
 * while a sketch is selected), and is what is found and shown for it.
 *
 * @param {string} query
 * @param {{ sketching?: boolean, labels?: Record<string, string> }} [options]
 * @returns {{ id: string, label: string, detail: string | null }[]}
 */
export function findCommands(query, { sketching = false, labels = {} } = {}) {
  const entries = sketching ? WHILE_SKETCHING : WORKSPACE;
  const shown = each => ({ id: each.id, label: labels[each.id] ?? each.label, detail: each.detail });
  const text = String(query ?? "").trim();
  if (!text) return entries.map(shown);
  const queried = wordsOf(text);
  if (!queried.length) return [];
  const named = [];
  const worded = [];
  for (const each of entries) {
    const result = shown(each);
    if (begins(`${result.label} ${result.detail ?? ""}`, queried)) named.push(result);
    else if (each.words.some(word => begins(word, queried))) worded.push(result);
  }
  return [...named, ...worded];
}
