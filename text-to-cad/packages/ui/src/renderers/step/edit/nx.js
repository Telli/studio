/**
 * Edit mode in Siemens NX's words: the CAD program the people asking for it knew best ("really
 * similar to NX", 2026-10-23). Its commands as NX's ribbon names them, its features as NX's Part
 * Navigator lists them ("Extrude (2)", an Edge Blend where a fillet is), the toolbar's tabs and
 * groups (Fusion's arrangement), and Extrude's Boolean. What the screen says only: the script, and
 * the notes the agent reads with the person's next message, keep their own names.
 */
import { PLANE_AXES, treeFeatures } from "./editMode.js";

/** A modeling command as NX's ribbon names it. Extrude, Revolve, Sweep along Guide and Through
 * Curves also take material away, by their Boolean (`booleanOf`). */
export const NX_COMMANDS = Object.freeze({
  extrude: "Extrude", cut: "Extrude", revolve: "Revolve", revolve_cut: "Revolve",
  sweep: "Sweep along Guide", sweep_cut: "Sweep along Guide", loft: "Through Curves", loft_cut: "Through Curves",
  hole: "Hole", fillet: "Edge Blend", chamfer: "Chamfer", rib: "Rib", draft: "Draft", shell: "Shell",
  pattern: "Pattern Feature", mirror: "Mirror Feature", split: "Split Body", delete_body: "Delete Body", plane: "Datum Plane",
});
export const nxCommand = command => NX_COMMANDS[command?.id] || command?.label || "";

// The commands that add material, each with the one taking the same shape away.
const UNITES = Object.freeze({ extrude: "cut", revolve: "revolve_cut", sweep: "sweep_cut", loft: "loft_cut" });
const SUBTRACTS = Object.freeze(Object.fromEntries(Object.entries(UNITES).map(([unite, subtract]) => [subtract, unite])));

/**
 * The Boolean of a command that has one, as NX's Extrude dialog sets it: `value` ("unite" or
 * "subtract") and `other`, the command doing the other one; null for a command without.
 */
export function booleanOf(id) {
  if (UNITES[id]) return { value: "unite", other: UNITES[id] };
  if (SUBTRACTS[id]) return { value: "subtract", other: SUBTRACTS[id] };
  return null;
}

/**
 * The Solid tab's groups, in Fusion's arrangement with NX's names. A group is its title, what it
 * holds (modeling commands by their `EDIT_COMMANDS` id, "sketch", or a tool of the viewer or the
 * agent: "measure", "clip", "references", "ask", "add-context", "annotate"), and how many of them
 * show as buttons (`shown`); the group's title is its menu, with every one. `end`: it stands at
 * the row's right end, as the agent's group does. A subtracting command (Extruded Cut...) is not
 * listed: it opens by its unite command's Boolean.
 */
export const SOLID_GROUPS = Object.freeze([
  { title: "Create", items: ["sketch", "extrude", "revolve", "sweep", "loft", "rib", "hole", "pattern", "mirror"], shown: 4 },
  { title: "Modify", items: ["fillet", "chamfer", "shell", "draft", "split", "delete_body"], shown: 3 },
  { title: "Construct", items: ["plane"], shown: 1 },
  { title: "Inspect", items: ["measure", "clip"], shown: 2 },
  { title: "Select", items: ["references"], shown: 1 },
  { title: "Ask the agent", items: ["ask", "add-context", "annotate"], shown: 3, end: true },
]);

const TAB_TITLES = Object.freeze({ solid: "Solid", sketch: "Sketch", inspect: "Inspect", assemble: "Assemble", drafting: "Drafting" });

/**
 * The toolbar's tabs, in order, each `{ id, title }`: Solid, Sketch and Inspect; Assemble for an
 * assembly (`assembly`); Drafting where a drawing's sheet has commands to offer (`drawing`). While a
 * sketch is edited (`sketching`) its task environment has the Sketch tab alone.
 */
export function workspaceTabs({ assembly = false, sketching = false, drawing = false } = {}) {
  const ids = sketching ? ["sketch"] : ["solid", "sketch", "inspect", ...(assembly ? ["assemble"] : []), ...(drawing ? ["drafting"] : [])];
  return ids.map(id => ({ id, title: TAB_TITLES[id] }));
}

// A feature's kind as the Part Navigator names it; a kind not here keeps its own.
export const NX_KINDS = Object.freeze({
  "Boss-Extrude": "Extrude", "Cut-Extrude": "Extrude", "Intersect-Extrude": "Extrude",
  "Boss-Revolve": "Revolve", "Cut-Revolve": "Revolve", "Boss-Sweep": "Sweep along Guide", "Cut-Sweep": "Sweep along Guide",
  "Boss-Loft": "Through Curves", "Cut-Loft": "Through Curves", Fillet: "Edge Blend", Pattern: "Pattern Feature",
  Mirror: "Mirror Feature", Plane: "Datum Plane", "Move/Copy": "Move Object", Split: "Split Body",
});
export const nxKind = kind => NX_KINDS[kind] || kind || "Feature";

// The generator's icon (`lib/nxIcons.generated.jsx`) for each row the Part Navigator lists, by the name
// it gives the row: a feature's kind, the datum coordinate system, a sketch; and, by what they are in
// NX's words, the part or assembly it opens on, its Expressions, and an assembly's Constraints.
const FEATURE_ICON_NAMES = Object.freeze({
  Extrude: "extrude", Revolve: "revolve", "Sweep along Guide": "sweep", "Through Curves": "loft", Hole: "hole", Rib: "rib",
  "Edge Blend": "blend", Chamfer: "chamfer", Draft: "draft", Shell: "shell", "Pattern Feature": "pattern",
  "Mirror Feature": "mirror", "Split Body": "split", "Move Object": "move", "Datum Plane": "plane",
  "Datum Coordinate System": "csys", Sketch: "sketch", Part: "part", Assembly: "assembly", Expressions: "expressions",
  Constraints: "assembly-constraints",
});

/**
 * The generator's icon for a row of the Part Navigator, by its kind as the engine names it ("Cut-Extrude")
 * or as NX does ("Extrude"): a Boolean changes no icon. A kind without one of its own reads as a solid feature.
 */
export const featureIconName = kind => FEATURE_ICON_NAMES[nxKind(kind)] || "extrude";

/** An origin plane as NX's datum coordinate system names it: "XY Plane" for SolidWorks' Top. */
export const nxPlane = name => (PLANE_AXES[name] ? `${PLANE_AXES[name]} Plane` : `${name} Plane`);

// A part's rows as NX's Part Navigator numbers them, in the order they are made after the datum
// coordinate system (0): a feature's sketch just before it ("Sketch (1)", then "Extrude (2)"). Row id
// → its `label` and the `name` given in the tree, which a title shows after the label, in quotes.
function numbered(features) {
  const rows = new Map();
  let made = 0;
  for (const feature of features || []) {
    if (feature.kind === "Sketch") {
      made += 1;
      rows.set(feature.id, { label: `Sketch (${made})`, name: feature.sketch?.title || feature.title });
      continue;
    }
    if (feature.sketch) {
      made += 1;
      rows.set(feature.sketch.id, { label: `Sketch (${made})`, name: feature.sketch.title });
    }
    made += 1;
    rows.set(feature.id, { label: `${nxKind(feature.kind)} (${made})`, name: feature.named || "" });
  }
  return rows;
}

/**
 * A part's features titled as NX's Part Navigator lists them, in the order they are made after the
 * datum coordinate system (0): a feature's sketch just before it ("Sketch (1) "Sketch1"", then
 * "Extrude (2)"), a name given in the tree after the kind, in quotes. Row id → its title.
 */
export function navigatorTitles(features) {
  return new Map([...numbered(features)].map(([id, { label, name }]) => [id, name ? `${label} "${name}"` : label]));
}

/**
 * A row as the Part Navigator numbers it, without the name given in the tree: "Hole (6)". Empty for a
 * row the Part Navigator does not list, so whoever names a feature (a face's chip, the timeline) can
 * keep its own words.
 */
export const navigatorLabel = (features, id) => numbered(features).get(id)?.label ?? "";

/** Every row's Part Navigator title in a design tree (`featureTree`): a part's, or each of an assembly's parts'. */
export function treeTitles(tree) {
  const lists = tree?.assembly ? (tree.components || []).map(component => component.features) : [tree?.features || []];
  return new Map(lists.flatMap(features => [...navigatorTitles(features)]));
}

const slashed = path => String(path).replace(/\\/g, "/");

/**
 * The feature a failed build is at, and why. The tree is the last part that built; the script that
 * stopped (`edit.error`, its traceback) has moved on from it, and the engine says where it stopped:
 * the deepest line of the project's own that the traceback holds (`edit.failure`, `{ file, line,
 * text }`, the line as written). A feature is that one only when a line it stands for (`lines`) is
 * that very line, the same file, the same number and the same words. A line that moved, was rewritten
 * or is new is no row of this tree, and neither is the neighbour now at its number: nothing is marked
 * that is not known. `{ id, why }`, `why` the error's last line; null when no feature agrees, or two do.
 */
export function buildFailure(tree, error, failure) {
  const why = String(error || "").trim().split("\n").at(-1).trim();
  const { file, line, text } = failure || {};
  const words = String(text ?? "").trim();
  if (!why || !file || !line || !words) return null;
  const owners = treeFeatures(tree).filter(feature => (feature.lines || [])
    .some(each => each.line === line && slashed(each.file) === slashed(file) && String(each.text).trim() === words));
  return owners.length === 1 ? { id: owners[0].id, why } : null;
}
