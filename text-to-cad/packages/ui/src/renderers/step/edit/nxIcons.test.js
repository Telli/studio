import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMMAND_ICON_NAMES, COMMAND_ICONS } from "./cadIcons.jsx";
import { EDIT_COMMANDS } from "./editMode.js";
import { NX_KINDS, booleanOf, featureIconName } from "./nx.js";
import { NX_ICON_NAMES, NxIcon, NxIconSprite } from "./nxIcons.generated.jsx";

// Edit mode's icons all come from one generator (`scripts/nx-icons.py`), so a command, a feature and
// the sprite have to agree on its names. The sprite is host elements all the way down: read it as a
// tree rather than rendering it.
const GENERATED = readFileSync(new URL("./nxIcons.generated.jsx", import.meta.url), "utf8");
const tree = node => (node && typeof node === "object" ? [node, ...[node.props?.children ?? []].flat(Infinity).flatMap(tree)] : []);

test("draws every command from the generator", () => {
  for (const { id } of EDIT_COMMANDS) {
    const Icon = COMMAND_ICONS[id];
    assert.equal(typeof Icon, "function", `${id} has an icon`);
    const drawn = Icon({ className: "size-5" });
    assert.equal(drawn.type, NxIcon, `${id} draws the generator's icon`);
    assert.equal(drawn.props.className, "size-5");
    assert.equal(drawn.props.name, COMMAND_ICON_NAMES[id]);
    assert.ok(NX_ICON_NAMES.includes(COMMAND_ICON_NAMES[id]), `${id} draws "${COMMAND_ICON_NAMES[id]}", which the generator has no icon of`);
  }
});

test("a subtracting command draws its unite command's icon, its Boolean being set in its dialog", () => {
  const subtracting = EDIT_COMMANDS.filter(({ id }) => booleanOf(id)?.value === "subtract").map(({ id }) => id);
  assert.deepEqual(subtracting, ["cut", "revolve_cut", "sweep_cut", "loft_cut"]);
  for (const id of subtracting) assert.equal(COMMAND_ICON_NAMES[id], COMMAND_ICON_NAMES[booleanOf(id).other], id);
});

// What the Part Navigator lists: a feature by the kind the engine gives it (Boss-Extrude) or the
// name NX does (Extrude), and the two rows that are not features.
const KEPT_NAMES = ["Hole", "Chamfer", "Shell", "Draft", "Rib"];
const NX_NAMES = [...new Set(Object.values(NX_KINDS)), ...KEPT_NAMES, "Sketch", "Datum Coordinate System"];

test("draws every Part Navigator kind", () => {
  for (const kind of [...NX_NAMES, ...Object.keys(NX_KINDS)]) {
    assert.ok(NX_ICON_NAMES.includes(featureIconName(kind)), `${kind} draws an icon the generator has`);
  }
  // A kind names the same feature either way, so it wears the same icon either way.
  for (const [kind, name] of Object.entries(NX_KINDS)) assert.equal(featureIconName(kind), featureIconName(name), kind);
  // Features told apart wear different icons. Move Object has none of its own yet: like any kind
  // the tree has no picture for, it reads as a solid feature.
  const apart = NX_NAMES.filter(name => name !== "Move Object");
  assert.equal(new Set(apart.map(featureIconName)).size, apart.length);
});

test("keeps ids of its own", () => {
  const ids = [...GENERATED.matchAll(/\bid="([^"]*)"/g)].map(([, id]) => id);
  assert.ok(ids.length > NX_ICON_NAMES.length, "the module defines its symbols and what they use");
  assert.deepEqual(ids.filter(id => !id.startsWith("nx-")), []);
  assert.equal(new Set(ids).size, ids.length, "each id is defined once");
  // What points at an id points at one of these.
  const used = [...GENERATED.matchAll(/url\(#([^)]*)\)/g)].map(([, id]) => id);
  assert.ok(used.length > 0);
  assert.deepEqual(used.filter(id => !ids.includes(id)), []);
});

test("draws each icon from its symbol in the sprite", () => {
  assert.ok(Object.isFrozen(NX_ICON_NAMES));
  const symbols = tree(NxIconSprite()).filter(element => element.type === "symbol").map(element => element.props.id);
  assert.deepEqual(symbols, NX_ICON_NAMES.map(name => `nx-${name}`));
  for (const name of NX_ICON_NAMES) {
    const drawn = NxIcon({ name, className: "size-4" });
    assert.equal(drawn.props.className, "size-4");
    assert.equal(drawn.props["aria-hidden"], "true");
    assert.deepEqual(tree(drawn).filter(element => element.type === "use").map(element => element.props.href), [`#nx-${name}`]);
  }
});
