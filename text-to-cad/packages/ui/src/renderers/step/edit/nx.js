/**
 * Edit mode in Siemens NX's words: the CAD program the people asking for it knew best ("really
 * similar to NX", 2026-10-23). Its commands as NX's ribbon names them, its features as NX's Part
 * Navigator lists them ("Extrude (2)", an Edge Blend where a fillet is), the ribbon's tabs and
 * groups, and Extrude's Boolean. What the screen says only: the script, and the notes the agent
 * reads with the person's next message, keep their own names.
 */
import { PLANE_AXES } from "./editMode.js";

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

/** NX's Home tab: its groups and the modeling commands each holds (a subtracting one opens by its Boolean). */
export const NX_GROUPS = Object.freeze([
  { title: "Feature", commands: ["extrude", "revolve", "hole", "rib", "sweep", "loft"] },
  { title: "Detail Feature", commands: ["fillet", "chamfer", "draft", "shell"] },
  { title: "Associative Copy", commands: ["pattern", "mirror"] },
  { title: "Trim", commands: ["split", "delete_body"] },
  { title: "Datum", commands: ["plane"] },
]);

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

/**
 * A part's features numbered as NX's Part Navigator numbers them, in the order they are made after
 * the datum coordinate system (0): a feature's sketch just before it ("Sketch (1) "Sketch1"", then
 * "Extrude (2)"), a name given in the tree after the kind, in quotes. Row id → its title.
 */
export function navigatorTitles(features) {
  const titles = new Map();
  let made = 0;
  for (const feature of features || []) {
    if (feature.kind === "Sketch") {
      made += 1;
      titles.set(feature.id, `Sketch (${made}) "${feature.sketch?.title || feature.title}"`);
      continue;
    }
    if (feature.sketch) {
      made += 1;
      titles.set(feature.sketch.id, `Sketch (${made}) "${feature.sketch.title}"`);
    }
    made += 1;
    titles.set(feature.id, `${nxKind(feature.kind)} (${made})${feature.named ? ` "${feature.named}"` : ""}`);
  }
  return titles;
}

/** Every row's Part Navigator title in a design tree (`featureTree`): a part's, or each of an assembly's parts'. */
export function treeTitles(tree) {
  const lists = tree?.assembly ? (tree.components || []).map(component => component.features) : [tree?.features || []];
  return new Map(lists.flatMap(features => [...navigatorTitles(features)]));
}
