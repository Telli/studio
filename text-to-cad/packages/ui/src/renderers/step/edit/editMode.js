/**
 * Edit mode's rules, pure: how a part's history, sizes and dimensions read in the viewer
 * (`cadgen/edit` reads them from the part's script), the modeling commands of the ribbon and
 * what each sends, what the note of a hand change says, and the undo history of hand changes.
 */

const ACRONYMS = new Set(["id", "od", "pcb", "usb", "led", "cnc", "fdm", "sla"]);
const UNIT_WORDS = Object.freeze({ mm: "Millimeters", in: "Inches", cm: "Centimeters", m: "Meters" });
const UNIT_MARKS = Object.freeze({ mm: "mm", in: "in", cm: "cm", m: "m" });
// The tracer's kinds, in the words a CAD tree uses for them.
const KIND_NAMES = Object.freeze({ Join: "Combine", Move: "Move", Cut: "Cut", Intersect: "Intersect" });
// A command's sizes, in the part's own units, as it opens: small next to a part a hand holds.
const DEFAULTS = Object.freeze({
  mm: { radius: "1", distance: "1", diameter: "3", depth: "5", thickness: "1", spacing: "10" },
  in: { radius: ".03", distance: ".03", diameter: ".125", depth: ".25", thickness: ".04", spacing: ".5" },
});
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

/** The origin's planes, as a CAD tree lists them under the part (SolidWorks' order). */
export const ORIGIN_PLANES = Object.freeze(["Front", "Top", "Right"]);
// A sketch's own dimensions: its profile's sizes, not the depth its feature gives it.
const SKETCH_DIMENSION = /:(x|y|r|diameter)$/;

/**
 * The part as a CAD tool's design tree shows it (SolidWorks' FeatureManager): its features
 * numbered by kind within each part (Boss-Extrude1, Boss-Extrude2, Cut-Extrude1, Fillet1),
 * each solid's sketch under it (Sketch1, on the plane it lies on), and an assembly's parts as
 * its components (Daisy tray<1>), each with its own features. A feature's id is the line of the
 * history that makes it, so a command that copies a feature finds its row by it.
 */
export function featureTree(state) {
  const partFeatures = features => {
    const counts = new Map();
    // A sketch with relations keeps the name its script gives it; a profile is numbered in order,
    // past the names those take, so no two sketches of a part share one.
    const taken = new Set((features || []).map(feature => feature.sketch?.name).filter(Boolean));
    let sketches = 0;
    const nextName = () => {
      do { sketches += 1; } while (taken.has(`Sketch${sketches}`));
      return `Sketch${sketches}`;
    };
    const sketchOf = (feature, id) => ({ id, title: feature.sketch.name || nextName(), plane: feature.sketch.plane || "",
      status: feature.sketch.status || "", file: feature.sketch.file || null, line: feature.sketch.line || null,
      constrained: Boolean(feature.sketch.name && feature.sketch.file) });
    return (features || []).map(feature => {
      if (feature.kind === "Sketch") {
        // A sketch nothing makes a solid of yet: a row of its own, as a CAD tree lists it.
        const sketch = sketchOf(feature, feature.key);
        return { id: feature.key, kind: "Sketch", title: sketch.title, name: "", count: 1, rows: [], file: feature.file, line: feature.line, sketch };
      }
      const count = (counts.get(feature.kind) || 0) + 1;
      counts.set(feature.kind, count);
      return {
        id: feature.key, kind: feature.kind, title: `${feature.kind}${count}`,
        name: feature.name ? sizeName(feature.name) : "", count: feature.count || 1,
        rows: feature.rows || [feature.key], file: feature.file, line: feature.line,
        sketch: feature.sketch ? sketchOf(feature, `sketch:${feature.key}`) : null,
        // What Edit Feature opens the feature's command with, when a command writes its line.
        edit: feature.edit || null,
        // Set aside by Suppress: its lines are comments in the script, shown greyed where they are.
        suppressed: Boolean(feature.suppressed),
      };
    });
  };
  if (state?.components?.length) {
    return { assembly: true, components: state.components.map(component => ({
      id: `component:${component.file}`, title: `${sizeName(component.name)}<1>`, features: partFeatures(component.features),
    })) };
  }
  return { assembly: false, features: partFeatures(state?.features) };
}

/** The sketch a tree row is (its own, or a feature's): what Edit Sketch opens and Extrude makes a solid of. */
export function treeSketch(tree, id) {
  if (!id) return null;
  for (const feature of treeFeatures(tree)) {
    if (feature.sketch && (feature.sketch.id === id || (feature.kind === "Sketch" && feature.id === id))) return feature.sketch;
  }
  return null;
}

/** A constrained sketch as the part's last trace solved it, by where its script makes it. */
export const sketchView = (state, sketch) => (state?.sketches || []).find(view => sketch && view.file === sketch.file && view.line === sketch.line) || null;

/** The name a new sketch of the part takes: one past the last its tree shows, as SolidWorks numbers them. */
export function nextSketchName(tree) {
  const numbers = treeFeatures(tree).map(feature => /^Sketch(\d+)$/.exec(feature.sketch?.title || "")?.[1]).filter(Boolean).map(Number);
  return `Sketch${Math.max(0, ...numbers) + 1}`;
}

/** Every feature of a tree, an assembly's parts' too, in order. */
export const treeFeatures = tree => (tree?.assembly ? tree.components.flatMap(component => component.features) : tree?.features || []);

/** What can be selected in a tree: its features, their sketches, the origin, its planes and an assembly's parts. */
export function treeIds(tree) {
  const ids = new Set(["origin", ...ORIGIN_PLANES.map(plane => `plane:${plane}`)]);
  for (const feature of treeFeatures(tree)) {
    ids.add(feature.id);
    if (feature.sketch) ids.add(feature.sketch.id);
  }
  for (const component of tree?.components || []) ids.add(component.id);
  return ids;
}

/**
 * The dimensions the selection draws on the model: a feature's (its sketch's and its depth), a
 * sketch's own (its profile's sizes), none for a plane, the origin or a part.
 */
export function selectionDimensions(state, tree, selected) {
  if (!selected) return [];
  const sketch = selected.startsWith("sketch:");
  const id = sketch ? selected.slice("sketch:".length) : selected;
  const feature = treeFeatures(tree).find(each => each.id === id);
  if (!feature) return [];
  const rows = new Set(feature.rows);
  return (state?.dimensions || []).filter(dimension => rows.has(dimension.row) && (!sketch || SKETCH_DIMENSION.test(dimension.id)));
}

/** How long the origin's axes are drawn: a third of the part's reach, in its millimetres. */
export function originAxis(bounds) {
  const [min, max] = bounds || [[-30, -30, -30], [30, 30, 30]];
  return (Math.max(...[0, 1, 2].map(axis => Math.max(Math.abs(min[axis]), Math.abs(max[axis])))) || 30) / 3;
}

/**
 * An origin plane drawn on the model, as a CAD tool shows a plane: a square through the origin
 * a little larger than the part, in the part's own millimetres. `null` for anything else.
 */
export function planeOutline(name, bounds) {
  if (!ORIGIN_PLANES.includes(name)) return null;
  const [min, max] = bounds || [[-50, -50, -50], [50, 50, 50]];
  const reach = Math.max(...[0, 1, 2].map(axis => Math.max(Math.abs(min[axis]), Math.abs(max[axis])))) * 1.15 || 50;
  const square = (u, v) => [[-reach, -reach], [reach, -reach], [reach, reach], [-reach, reach]].map(([a, b]) => {
    const point = [0, 0, 0];
    point[u] = a;
    point[v] = b;
    return point;
  });
  return name === "Top" ? square(0, 1) : name === "Front" ? square(0, 2) : square(1, 2);
}

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

/**
 * The ribbon's modeling commands, as a CAD tool groups them: Create (the Extruded and Revolved
 * Boss/Base and Cut a sketch makes, `sketch`; Hole, Pattern, Mirror) and Modify (Fillet, Chamfer,
 * Shell). `picks` is what the command acts on, which the Select tool's mode turns to when it
 * opens: edges, faces, or none (Pattern copies a history feature; the sketch features take the
 * sketch selected in the design tree).
 */
export const EDIT_COMMANDS = Object.freeze([
  { id: "extrude", label: "Extruded Boss/Base", group: "Create", picks: null, sketch: true, prompt: "Select a sketch in the design tree." },
  { id: "revolve", label: "Revolved Boss/Base", group: "Create", picks: null, sketch: true, prompt: "Select a sketch in the design tree." },
  { id: "cut", label: "Extruded Cut", group: "Create", picks: null, sketch: true, prompt: "Select a sketch in the design tree." },
  { id: "revolve_cut", label: "Revolved Cut", group: "Create", picks: null, sketch: true, prompt: "Select a sketch in the design tree." },
  { id: "hole", label: "Hole", group: "Create", picks: "faces", prompt: "Select a flat face for the hole." },
  { id: "pattern", label: "Pattern", group: "Create", picks: null, prompt: "" },
  { id: "mirror", label: "Mirror", group: "Create", picks: "faces", prompt: "Select a flat face to mirror about, or pick a plane." },
  { id: "fillet", label: "Fillet", group: "Modify", picks: "edges", prompt: "Select the edges to round." },
  { id: "chamfer", label: "Chamfer", group: "Modify", picks: "edges", prompt: "Select the edges to bevel." },
  { id: "shell", label: "Shell", group: "Modify", picks: "faces", prompt: "Select the faces to open." },
]);

export const editCommand = id => EDIT_COMMANDS.find(command => command.id === id) || null;

/** A command's inputs as it opens, in the part's units: what the panel shows before anything is typed. */
export function commandDefaults(id, units) {
  const size = DEFAULTS[units] || DEFAULTS.mm;
  switch (id) {
    case "fillet": return { radius: size.radius };
    case "chamfer": return { distance: size.distance };
    case "hole": return { diameter: size.diameter, depth: size.depth, through: true, x: "0", y: "0", z: "0" };
    case "shell": return { thickness: size.thickness };
    case "mirror": return { plane: "YZ" };
    case "pattern": return { type: "linear", direction: "X", spacing: size.spacing, count: "3", reverse: false };
    case "extrude": return { end: "blind", depth: size.depth, reverse: false };
    case "cut": return { end: "blind", depth: size.depth, reverse: false };
    case "revolve":
    case "revolve_cut": return { axis: "", angle: "360", reverse: false };
    default: return {};
  }
}

/**
 * What the viewer's selection is to a command: each face or edge by its selector, with what the
 * viewer read of it (its kind, centre, and area or length), so `cadgen/edit` finds it on the part
 * as its script makes it now.
 */
export function selectionItems(references = []) {
  return references.filter(reference => reference?.selectorType === "face" || reference?.selectorType === "edge").map(reference => {
    const pick = reference.pickData || {};
    const face = reference.selectorType === "face";
    const center = pick.center && pick.center.length === 3 ? Array.from(pick.center, Number) : null;
    const size = Number(face ? pick.area : pick.length);
    return {
      selector: String(reference.displaySelector || reference.normalizedSelector || ""),
      type: String((face ? pick.surfaceType : pick.curveType) || ""),
      ...(center ? { center } : {}),
      ...(Number.isFinite(size) ? { size } : {}),
    };
  });
}

/** A selected face or edge as the panel lists it: "Edge 12", "Face 4". */
export function selectionLabel(item) {
  const match = /([fe])(\d+)$/.exec(String(item?.selector || ""));
  if (!match) return String(item?.selector || "");
  return `${match[1] === "f" ? "Face" : "Edge"} ${match[2]}`;
}

/** The axes a hole moves along on a flat face: the two that lie in it, when its normal runs along the third. */
export function faceOffsetAxes(normal) {
  if (!normal || normal.length !== 3) return [];
  const [x, y, z] = Array.from(normal, value => Math.abs(Number(value)));
  if (Math.abs(z - 1) < 1e-6) return ["x", "y"];
  if (Math.abs(x - 1) < 1e-6) return ["y", "z"];
  if (Math.abs(y - 1) < 1e-6) return ["x", "z"];
  return [];
}

/**
 * The request a command's OK sends (`cadgen/edit`): the command, its selection, its inputs as
 * typed and, for Mirror and Pattern, the history feature they copy (none copies the body).
 */
export function commandRequest(id, values, items, feature, sketch = null, editing = null) {
  // Edit Feature: the feature's own line written again, acting on what it acts on now.
  const replace = editing ? { replace: { row: editing.id } } : {};
  if (id === "extrude" || id === "cut") {
    return { command: id, sketch: sketch ? { file: sketch.file, line: sketch.line, name: sketch.title } : null,
      inputs: { end: values.end, ...(values.end === "through" ? {} : { depth: values.depth }), reverse: Boolean(values.reverse) }, ...replace };
  }
  if (id === "revolve" || id === "revolve_cut") {
    return { command: id, sketch: sketch ? { file: sketch.file, line: sketch.line, name: sketch.title, axis: values.axis } : null,
      inputs: { angle: values.angle, reverse: Boolean(values.reverse) }, ...replace };
  }
  const inputs = {};
  switch (id) {
    case "fillet": inputs.radius = values.radius; break;
    case "chamfer": inputs.distance = values.distance; break;
    case "shell": inputs.thickness = values.thickness; break;
    case "hole":
      Object.assign(inputs, { diameter: values.diameter, depth: values.through ? "" : values.depth });
      for (const axis of ["x", "y", "z"]) if (String(values[axis] ?? "").trim() && Number(values[axis]) !== 0) inputs[axis] = values[axis];
      break;
    case "mirror": inputs.plane = values.plane; break;
    case "pattern":
      Object.assign(inputs, { type: values.type, count: values.count });
      if (values.type === "linear") {
        const spacing = String(values.spacing ?? "").trim();
        Object.assign(inputs, { direction: values.direction, spacing: values.reverse ? `-(${spacing})` : spacing });
      }
      break;
    default: break;
  }
  if (editing) return { command: id, selection: [], inputs, ...replace };
  const picks = editCommand(id)?.picks;
  const selection = picks === "edges" ? items : picks === "faces" ? items.filter(item => /f\d+$/.test(item.selector)) : [];
  return { command: id, selection, inputs, ...(feature?.row && (id === "mirror" || id === "pattern") ? { feature } : {}) };
}

/** A feature's panel as Edit Feature opens it: the command's inputs, set to the feature's values. */
export const editingValues = (editing, units) => ({ ...commandDefaults(editing.command, units), ...editing.values });

/** Whether a panel's values are still the ones it opened with, so its OK has nothing to write. */
export const sameValues = (values, opened) => Object.keys({ ...values, ...opened })
  .every(key => String(values[key] ?? "").trim() === String(opened[key] ?? "").trim());

/** Why a command's OK cannot go yet, or "" when it can. Edit Feature keeps what the feature acts on, so it waits on nothing picked. */
export function commandBlocked(id, items, sketch = null, values = {}, editing = null) {
  if (id === "extrude" || id === "cut" || id === "revolve" || id === "revolve_cut") {
    if (!sketch) return "Select a sketch in the design tree.";
    const making = id.startsWith("revolve") ? "revolve" : "extrude";
    if (!sketch.constrained) return `${sketch.title} is drawn with build123d's shapes, not as a sketch. Ask the agent to ${making} it.`;
    if (making === "revolve" && !values.axis) return `Draw a centerline in ${sketch.title} to revolve about.`;
    return "";
  }
  if (editing) return "";
  const faces = items.filter(item => /f\d+$/.test(item.selector));
  if (id === "fillet" || id === "chamfer") return items.length ? "" : "Select edges on the model.";
  if (id === "hole") return faces.length === 1 ? "" : faces.length ? "Select one face." : "Select a flat face on the model.";
  if (id === "shell") return faces.length ? "" : "Select the faces to open.";
  if (id === "mirror") return faces.length > 1 ? "Select one face, or none to pick a plane." : "";
  return "";
}

/** The lines of a sketch a revolve can turn about, its centerlines first, as the panel lists them. */
export function revolveAxes(view) {
  const lines = (view?.state?.curves || []).filter(curve => curve.kind === "line");
  return [...lines.filter(line => line.construction), ...lines.filter(line => !line.construction)]
    .map(line => ({ value: line.id, label: line.construction ? `${line.id}, centerline` : line.id }));
}

/**
 * What a command tells the agent: "In edit mode I added Fillet2, radius 0.02 in, 4 edges
 * (parts/tray.py, line 37)."; Edit Feature's: "In edit mode I changed Fillet2 to radius 0.03 in, ...".
 */
export function commandNote(change, title) {
  const said = [...(change.inputs || []).map(input => `${input.label.toLowerCase()} ${withUnit(input.display, input.unit)}`),
    change.what].filter(Boolean);
  const name = title || change.feature;
  if (change.edited) return `In edit mode I changed ${name}${said.length ? ` to ${said.join(", ")}` : ""} (${change.file}, line ${change.line}).`;
  return `In edit mode I added ${name}${said.length ? `, ${said.join(", ")}` : ""} (${change.file}, line ${change.line}).`;
}

/** What Undo or Redo of a command tells the agent. */
export function commandUndoNote(change, title, redo) {
  const name = title || change.feature;
  if (change.edited) return `In edit mode I ${redo ? `changed ${name} again` : `put ${name} back as it was`} (${change.file}, line ${change.line}).`;
  return `In edit mode I ${redo ? "added" : "removed"} ${name}${redo ? " again" : ""} (${change.file}, line ${change.line}).`;
}

// Names in a sentence: "Fillet1", "Fillet1 and Cut-Extrude1", "Fillet1, Hole1 and Shell1".
const listWords = names => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] || "");

/** What Delete of a feature tells the agent, and what its Undo and Redo do. */
export function deleteNote(change, { undo = false, redo = false } = {}) {
  const done = undo ? "put back" : redo ? "deleted again" : "deleted";
  return `In edit mode I ${done} ${change.title} (${change.file}, line ${change.line}).`;
}

/**
 * Why a feature was not deleted (or suppressed, `verb`), said as the features of the tree that
 * still use what it makes ("Boss-Extrude1 is used by Fillet1. Delete it first, or ask the agent.");
 * the server's own words when it names none.
 */
export function deleteRefusal(reply, tree, title, verb = "Delete") {
  const dependents = reply?.dependents;
  const rows = new Set((dependents?.lines || []).map(line => `${dependents.file}:${line}`));
  const users = treeFeatures(tree).filter(feature => feature.rows.some(row => rows.has(row))).map(feature => feature.title);
  if (!users.length) return reply?.error || `${title} could not be ${verb === "Delete" ? "deleted" : "suppressed"}.`;
  return `${title} is used by ${listWords(users)}. ${verb} ${users.length > 1 ? "them" : "it"} first, or ask the agent.`;
}

/** What Suppress or Unsuppress of a feature tells the agent, and what its Undo and Redo do. */
export function suppressNote(change, { undo = false, redo = false } = {}) {
  const on = undo ? !change.on : change.on;
  const done = on ? `suppressed ${change.title}${redo ? " again" : ""}: its lines are comments now`
    : `unsuppressed ${change.title}${redo ? " again" : ""}: its lines are back`;
  return `In edit mode I ${done} (${change.file}, line ${change.line}).`;
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

/**
 * How many of the history's changes came after `before` (a sketch session's: the change made last
 * before it began). Counted from that change, not a length, as the history keeps only its last
 * changes: once `before` has gone from it, every change left came after.
 */
export function changesSince(history, before) {
  const at = before ? history.done.lastIndexOf(before) : -1;
  return history.done.length - (at + 1);
}

// A change whose lines are put back as they were (a command's, a sketch's), rather than one number.
const spliced = change => Boolean(change.undo?.hunks);

/** Undo: the last change, and the request that takes it back: its number written back, or its lines put back. */
export function undoStep(history) {
  const change = history.done.at(-1);
  if (!change) return null;
  return { change, request: spliced(change) ? { splice: change.undo } : { literal: change.literal, text: change.from },
    next: { done: history.done.slice(0, -1), undone: [...history.undone, change] } };
}

/** Redo: the last change undone, and the request that makes it again. */
export function redoStep(history) {
  const change = history.undone.at(-1);
  if (!change) return null;
  return { change, request: spliced(change) ? { splice: change.redo } : { literal: change.literal, text: change.to },
    next: { done: [...history.done, change], undone: history.undone.slice(0, -1) } };
}
