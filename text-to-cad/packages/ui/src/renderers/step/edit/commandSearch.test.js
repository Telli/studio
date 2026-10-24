import assert from "node:assert/strict";
import test from "node:test";

import { COMMAND_WORDS, findCommands } from "./commandSearch.js";
import { EDIT_COMMANDS } from "./editMode.js";
import { SOLID_GROUPS, nxCommand } from "./nx.js";
import { SKETCH_TOOLS } from "./sketchMode.js";

const ids = (query, options) => findCommands(query, options).map(result => result.id);

// The toolbar's order: the Solid tab's groups (a command's Subtract right after it), then what Inspect, Assemble and
// Drafting add. Sketching, the sketch environment's tools come first, in its toolbar's order.
const SOLID = ["sketch", "extrude", "cut", "revolve", "revolve_cut", "sweep", "sweep_cut", "loft", "loft_cut", "rib", "hole", "pattern", "mirror",
  "fillet", "chamfer", "shell", "draft", "split", "delete_body", "plane", "measure", "clip"];
const OTHER_TABS = ["mass", "draft-analysis", "interference", "compare", "normal-to", "appearance", "expressions", "mate", "exploded",
  "drawing", "edit-sheet", "make-drawing"];
const SKETCH = ["exit", "normal", "line", "rectangle", "center_rectangle", "three_point_rectangle", "circle", "perimeter_circle", "arc",
  "three_point_arc", "tangent_arc", "slot", "centerpoint_slot", "polygon", "spline", "centerline", "point", "fillet", "chamfer", "trim", "extend",
  "convert", "intersection", "offset", "mirror", "move_entities", "copy_entities", "rotate_entities", "scale_entities", "linear_pattern",
  "circular_pattern", "dimension", "construction"];

test("finds Fillet by NX's name for it, Edge Blend, or by another tool's word for it", () => {
  assert.deepEqual(findCommands("fillet")[0], { id: "fillet", label: "Edge Blend", detail: null });
  assert.deepEqual(ids("round"), ["fillet"]);
  assert.deepEqual(ids("edge blend"), ["fillet"]);
});

test("finds a cut as Extrude with its Boolean set to Subtract", () => {
  assert.deepEqual(findCommands("cut")[0], { id: "cut", label: "Extrude", detail: "Subtract" });
  assert.equal(findCommands("pocket")[0].id, "cut");
  assert.deepEqual(findCommands("pocket"), [{ id: "cut", label: "Extrude", detail: "Subtract" }]);
});

test("finds a Datum Plane by its first word, and nothing by a word nothing has", () => {
  assert.equal(findCommands("datum")[0].label, "Datum Plane");
  assert.deepEqual(findCommands("zzz"), []);
});

test("finds Line only among a sketch's tools", () => {
  assert.deepEqual(findCommands("line"), []);
  assert.equal(findCommands("line", { sketching: true })[0].id, "line");
});

test("keeps the words another tool has for each command, as the design lists them", () => {
  assert.deepEqual(COMMAND_WORDS, {
    fillet: ["fillet", "round", "blend"], chamfer: ["bevel"], extrude: ["boss", "pad", "pull"],
    cut: ["cut", "pocket", "extruded cut"], revolve: ["lathe", "turn"], revolve_cut: ["groove"], loft: ["loft", "lofted"], sweep: ["swept"],
    hole: ["drill", "tap", "thread"], pattern: ["array", "copy"], mirror: ["symmetry"], shell: ["hollow"], draft: ["taper"], rib: ["web"],
    split: ["split body"], delete_body: ["remove body", "keep body"],
    plane: ["datum", "work plane", "construction plane", "offset plane"], sketch: ["draw", "profile"], measure: ["distance"],
    clip: ["section", "cross section", "section analysis"],
  });
});

test("finds each command by every word it has, a phrase too", () => {
  for (const [id, words] of Object.entries(COMMAND_WORDS)) {
    for (const word of words) assert.ok(ids(word).includes(id), `"${word}" finds ${id}`);
  }
  // The words that are one command's alone are found alone.
  assert.deepEqual(ids("pad"), ["extrude"]);
  assert.deepEqual(ids("groove"), ["revolve_cut"]);
  assert.deepEqual(ids("work plane"), ["plane"]);
  assert.deepEqual(ids("cross section"), ["clip"]);
  assert.deepEqual(ids("remove body"), ["delete_body"]);
});

test("finds each command by the name it has in the toolbar", () => {
  for (const group of SOLID_GROUPS) {
    for (const id of group.items) {
      const command = EDIT_COMMANDS.find(each => each.id === id);
      if (command) assert.ok(ids(nxCommand(command)).includes(id), `${nxCommand(command)} finds ${id}`);
    }
  }
  assert.ok(ids("Edit Section").includes("clip"));
  assert.ok(ids("Measure Bodies").includes("mass"));
  assert.ok(ids("Assembly Constraints").includes("mate"));
  assert.ok(ids("Orient View").includes("normal-to"));
  for (const tool of SKETCH_TOOLS) assert.ok(ids(tool.label, { sketching: true }).includes(tool.id), `${tool.label} finds ${tool.id}`);
});

test("lists everything in the toolbar's order when nothing is typed", () => {
  assert.deepEqual(ids(""), [...SOLID, ...OTHER_TABS]);
  assert.deepEqual(ids("   "), [...SOLID, ...OTHER_TABS]);
  // Every modeling command, a subtracting one too, and each once.
  const commands = ids("").filter(id => EDIT_COMMANDS.some(command => command.id === id));
  assert.deepEqual([...commands].sort(), EDIT_COMMANDS.map(command => command.id).sort());
  // The Solid tab's order is the one it draws (`SOLID_GROUPS`), less what is not a CAD command (Select, Ask the agent).
  const subtracts = new Set(["cut", "revolve_cut", "sweep_cut", "loft_cut"]);
  const drawn = SOLID_GROUPS.flatMap(group => group.items).filter(id => SOLID.includes(id));
  assert.deepEqual(SOLID.filter(id => !subtracts.has(id)), drawn);
});

test("leaves out of the search what is not a CAD command: the filters of Select and the agent's buttons", () => {
  const left = SOLID_GROUPS.flatMap(group => group.items).filter(id => !ids("").includes(id));
  assert.deepEqual(left, ["references", "ask", "add-context", "annotate"]);
});

test("lists a sketch's own tools first while it is open, then the rest", () => {
  const all = ids("", { sketching: true });
  assert.deepEqual(all.slice(0, SKETCH.length), SKETCH);
  // Fillet, Chamfer and Mirror are the sketch's own while it is open: the sketch has no Edge Blend to find.
  const shadowed = new Set(["fillet", "chamfer", "mirror"]);
  assert.deepEqual(all.slice(SKETCH.length), [...SOLID, ...OTHER_TABS].filter(id => !shadowed.has(id)));
  assert.equal(new Set(all).size, all.length);
});

test("finds Fillet, Chamfer and Mirror as the sketch's tools while a sketch is open, and as the modeling commands outside it", () => {
  assert.deepEqual(findCommands("fillet", { sketching: true }), [{ id: "fillet", label: "Fillet", detail: null }]);
  assert.deepEqual(findCommands("chamfer", { sketching: true }), [{ id: "chamfer", label: "Chamfer", detail: null }]);
  assert.deepEqual(findCommands("mirror", { sketching: true }), [{ id: "mirror", label: "Mirror Curve", detail: null }]);
  assert.deepEqual(findCommands("mirror"), [{ id: "mirror", label: "Mirror Feature", detail: null }]);
  // A sketch's tool takes the other words for it too: a round is a fillet in a sketch as well.
  assert.equal(findCommands("round", { sketching: true })[0].label, "Fillet");
});

test("still finds the modeling commands while a sketch is open, which the toolbar's Feature group makes of it", () => {
  assert.equal(findCommands("extrude", { sketching: true })[0].id, "extrude");
  assert.deepEqual(ids("hole", { sketching: true }), ["hole"]);
  assert.deepEqual(ids("pocket", { sketching: true }), ["cut"]);
});

test("puts a command found by NX's name for it before one found by another tool's word", () => {
  // Drawing is a name; Sketch has draw among its words.
  assert.deepEqual(ids("draw").slice(0, 2), ["drawing", "sketch"]);
  // Among the names, and among the words, the toolbar's order.
  assert.deepEqual(ids("boss"), ["extrude", "revolve", "sweep", "loft"]);
});

test("sets a Boolean beside the name it belongs to, and finds a cut by what a cut is called elsewhere", () => {
  assert.deepEqual(findCommands("extrude"), [{ id: "extrude", label: "Extrude", detail: null }, { id: "cut", label: "Extrude", detail: "Subtract" }]);
  assert.deepEqual(findCommands("subtract").map(result => [result.id, result.label, result.detail]), [
    ["cut", "Extrude", "Subtract"], ["revolve_cut", "Revolve", "Subtract"], ["sweep_cut", "Sweep along Guide", "Subtract"],
    ["loft_cut", "Through Curves", "Subtract"]]);
  assert.deepEqual(ids("extrude subtract"), ["cut"]);
  // What SolidWorks called them.
  assert.deepEqual(ids("revolved cut"), ["revolve_cut"]);
  assert.deepEqual(ids("swept cut"), ["sweep_cut"]);
  assert.deepEqual(ids("lofted cut"), ["loft_cut"]);
  assert.deepEqual(ids("cut"), ["cut", "revolve_cut", "sweep_cut", "loft_cut"]);
});

test("reads a query word by word, each the start of a word of the name, in any case", () => {
  assert.deepEqual(ids("  EDGE   bl "), ["fillet"]);
  assert.deepEqual(ids("pat"), ["pattern"]);
  // A word starts a word; it is not found inside one.
  assert.deepEqual(ids("ect"), []);
  assert.deepEqual(ids("urve"), []);
  // The slash and the 3 of a name are words too.
  assert.deepEqual(ids("to from", { sketching: true }), ["construction"]);
  assert.deepEqual(ids("3 points", { sketching: true }), ["three_point_rectangle", "perimeter_circle", "three_point_arc"]);
  // Nothing to read in a query of marks alone.
  assert.deepEqual(ids("/"), []);
  assert.deepEqual(ids(undefined), ids(""));
});

test("finds the Inspect, Assemble and Drafting buttons by their names and by what other tools call them", () => {
  assert.deepEqual(ids("mass properties"), ["mass"]);
  assert.deepEqual(ids("mate"), ["mate"]);
  assert.deepEqual(ids("color"), ["appearance"]);
  assert.deepEqual(ids("look at"), ["normal-to"]);
  assert.deepEqual(ids("equations"), ["expressions"]);
  assert.deepEqual(ids("interference detection"), ["interference"]);
  assert.deepEqual(ids("new drawing"), ["make-drawing"]);
  assert.deepEqual(ids("explode"), ["exploded"]);
  assert.deepEqual(ids("smart dimension", { sketching: true }), ["dimension"]);
});

test("finds the sketch's own buttons by what SolidWorks calls them, and the plane's words stay the plane's", () => {
  assert.equal(ids("construction", { sketching: true })[0], "construction");
  assert.deepEqual(ids("construction"), ["plane"]);
  assert.deepEqual(ids("exit sketch", { sketching: true }), ["exit"]);
  assert.deepEqual(ids("centerline", { sketching: true }), ["centerline"]);
  assert.deepEqual(ids("entities", { sketching: true }), ["trim", "convert", "offset"]);
});

test("names a button as the toolbar names it now, where it varies", () => {
  // Sketch reads Edit Sketch while a sketch is selected in the Part Navigator.
  assert.deepEqual(ids("edit sketch"), []);
  assert.deepEqual(findCommands("edit sk", { labels: { sketch: "Edit Sketch" } }), [{ id: "sketch", label: "Edit Sketch", detail: null }]);
  assert.deepEqual(findCommands("", { labels: { sketch: "Edit Sketch" } })[0], { id: "sketch", label: "Edit Sketch", detail: null });
});

test("hands back results that are the caller's own", () => {
  findCommands("")[0].label = "changed";
  assert.equal(findCommands("")[0].label, "Sketch");
  assert.deepEqual(Object.keys(findCommands("fillet")[0]), ["id", "label", "detail"]);
});
