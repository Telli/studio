import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import { featureTree } from "./editMode.js";
import { boundsCorners, featurePick, placeBar, quickEditShown, screenBox, selectionBarActions } from "./selectionBar.js";

// The workspace with Select in hand and nothing open: what the bar is offered under.
const WORKSPACE = { editing: true, commandOpen: false, sketching: false, featureOf: () => null };
const face = { kind: "face", id: "o1.f12" };
const edge = { kind: "edge", id: "o1.e3" };
const ids = actions => actions.map(action => action.id);

test("offers Ask, Add to context and Annotate on a face", () => {
  const actions = selectionBarActions({ ...WORKSPACE, picks: [face] });
  assert.deepEqual(ids(actions), ["ask", "add-context", "annotate"]);
  assert.ok(actions.every(action => action.enabled === true), "all there to use");
  assert.deepEqual(ids(selectionBarActions({ ...WORKSPACE, picks: [edge] })), ["ask", "add-context", "annotate"]);
  assert.deepEqual(ids(selectionBarActions({ ...WORKSPACE, picks: [face, edge] })), ["ask", "add-context", "annotate"]);
});

test("adds Edit once the face's feature is known", () => {
  const hole = pick => (pick.id === face.id ? "hole" : null);
  assert.deepEqual(ids(selectionBarActions({ ...WORKSPACE, picks: [face], featureOf: hole })), ["ask", "add-context", "annotate", "edit"]);
  // The feature of another face is not this one's: while any pick's is not known, there is no feature to edit.
  assert.deepEqual(ids(selectionBarActions({ ...WORKSPACE, picks: [face, edge], featureOf: hole })), ["ask", "add-context", "annotate"]);
  // Two faces of one feature are that feature's.
  const both = () => "hole";
  assert.deepEqual(ids(selectionBarActions({ ...WORKSPACE, picks: [face, edge], featureOf: both })).at(-1), "edit");
  // Faces made by two features are not one feature's to edit.
  const split = pick => (pick.kind === "face" ? "hole" : "blend");
  assert.deepEqual(ids(selectionBarActions({ ...WORKSPACE, picks: [face, edge], featureOf: split })), ["ask", "add-context", "annotate"]);
});

test("offers Edit on a row of the Part Navigator or the timeline, which is its own feature, unless it has nothing to edit", () => {
  const row = { kind: "feature", id: "e2" };
  assert.deepEqual(ids(selectionBarActions({ ...WORKSPACE, picks: [row] })), ["ask", "add-context", "annotate", "edit"]);
  assert.deepEqual(ids(selectionBarActions({ ...WORKSPACE, picks: [{ ...row, editable: false }] })), ["ask", "add-context", "annotate"]);
});

test("holds Edit, saying why, while a change is on its way", () => {
  const row = { kind: "feature", id: "e2" };
  const edit = selectionBarActions({ ...WORKSPACE, picks: [row], busy: true }).find(action => action.id === "edit");
  assert.equal(edit.enabled, false);
  assert.match(edit.reason, /change/i);
  // What does not change the part stays at hand.
  assert.ok(selectionBarActions({ ...WORKSPACE, picks: [row], busy: true }).filter(action => action.id !== "edit").every(action => action.enabled));
});

test("stays out of an open command", () => {
  assert.deepEqual(selectionBarActions({ ...WORKSPACE, picks: [face], commandOpen: true }), []);
  assert.deepEqual(selectionBarActions({ ...WORKSPACE, picks: [{ kind: "feature", id: "e2" }], commandOpen: true }), []);
});

test("stays out of an open sketch", () => {
  assert.deepEqual(selectionBarActions({ ...WORKSPACE, picks: [face], sketching: true }), []);
});

test("is the workspace's alone: Simple view has none", () => {
  assert.deepEqual(selectionBarActions({ ...WORKSPACE, editing: false, picks: [face] }), []);
});

test("is about faces, edges and a feature, and nothing else", () => {
  assert.deepEqual(selectionBarActions({ ...WORKSPACE, picks: [] }), []);
  assert.deepEqual(selectionBarActions({ ...WORKSPACE, picks: undefined }), []);
  // A part, a vertex or a plane is none of the three.
  for (const kind of ["part", "vertex", "plane"]) assert.deepEqual(selectionBarActions({ ...WORKSPACE, picks: [{ kind, id: "x" }] }), [], kind);
  assert.deepEqual(selectionBarActions({ ...WORKSPACE, picks: [face, { kind: "part", id: "x" }] }), []);
});

test("shows Quick Edit in the workspace only after Ask", () => {
  assert.equal(quickEditShown({ editing: true, asked: false, selectionActionVisible: true }), false);
  assert.equal(quickEditShown({ editing: true, asked: true, selectionActionVisible: true }), true);
  // Ask with nothing picked is Quick Edit on the whole part.
  assert.equal(quickEditShown({ editing: true, asked: true, selectionActionVisible: false }), true);
  assert.equal(quickEditShown({ editing: true, asked: false, selectionActionVisible: false }), false);
  // Simple view shows it as it always has: with what is picked, and not otherwise, whether or not anything was asked.
  assert.equal(quickEditShown({ editing: false, asked: false, selectionActionVisible: true }), true);
  assert.equal(quickEditShown({ editing: false, asked: false, selectionActionVisible: false }), false);
  assert.equal(quickEditShown({ editing: false, asked: true, selectionActionVisible: false }), false);
});

// The sample bracket as the engine reads it: two extrudes a command made from sketches, a fillet written by hand,
// and a sketch nothing uses yet.
const command = { command: "extrude", values: {}, keeps: "" };
const sketched = (name, line) => ({ name, plane: "Top", file: "bracket.py", line, status: "Fully defined" });
const PART = featureTree({
  features: [
    { key: "e1", kind: "Boss-Extrude", name: "plate", file: "bracket.py", line: 8, edit: command, sketch: sketched("SKETCH_000", 5) },
    { key: "b1", kind: "Fillet", name: "plate", file: "bracket.py", line: 15 },
    { key: "s9", kind: "Sketch", file: "bracket.py", line: 20, sketch: sketched("SKETCH_001", 20) },
  ],
});

test("finds the row a selection in the Part Navigator or the timeline is", () => {
  const extrude = featurePick(PART, "e1");
  assert.deepEqual([extrude.kind, extrude.id, extrude.editable, extrude.sketch], ["feature", "e1", true, null]);
  assert.equal(extrude.feature, PART.features[0]);
  // A feature no command made has no panel to reopen: it is a pick, and has nothing to edit.
  assert.deepEqual([featurePick(PART, "b1").id, featurePick(PART, "b1").editable], ["b1", false]);
  // A sketch of its own is edited as a sketch; so is the one a feature was made from, selected by the id the tree gives it.
  const loose = featurePick(PART, "s9");
  assert.deepEqual([loose.id, loose.editable, loose.sketch], ["s9", true, PART.features[2].sketch]);
  const nested = featurePick(PART, "sketch:e1");
  assert.deepEqual([nested.id, nested.editable, nested.sketch], ["sketch:e1", true, PART.features[0].sketch]);
  assert.equal(nested.feature, PART.features[0]);
});

test("finds no row in what is not a feature: the origin, a plane, nothing, a row the tree does not have", () => {
  for (const selected of [null, "", "origin", "plane:Top", "e9", "component:base.py"]) assert.equal(featurePick(PART, selected), null, String(selected));
});

test("an assembly's parts are opened to be edited, so none of its features is edited from here", () => {
  const assembly = featureTree({ components: [{ file: "base.py", name: "base", features: [
    { key: "c1", kind: "Boss-Extrude", name: "base", file: "base.py", line: 3, edit: command }] }] });
  const pick = featurePick(assembly, "c1");
  assert.deepEqual([pick.id, pick.editable], ["c1", false]);
});

// A 600 × 400 view, kept 8 px in from its edges and below a 32 px toolbar; a bar 200 × 28.
const BOUNDS = Object.freeze({ left: 8, top: 40, right: 592, bottom: 392 });
const SIZE = Object.freeze({ width: 200, height: 28 });
const box = (left, top, right, bottom) => ({ left, top, right, bottom });

test("places the bar above the pick, centred on it, 10 px off", () => {
  assert.deepEqual(placeBar({ box: box(250, 200, 350, 260), size: SIZE, bounds: BOUNDS }), { left: 200, top: 162 });
});

test("places it below where there is no room above", () => {
  assert.deepEqual(placeBar({ box: box(250, 50, 350, 90), size: SIZE, bounds: BOUNDS }), { left: 200, top: 100 });
});

test("keeps it inside the view's edges", () => {
  assert.deepEqual(placeBar({ box: box(0, 200, 20, 220), size: SIZE, bounds: BOUNDS }), { left: 8, top: 162 });
  assert.deepEqual(placeBar({ box: box(580, 200, 600, 220), size: SIZE, bounds: BOUNDS }), { left: 392, top: 162 });
});

test("keeps out of the cards over the view: above or below the pick, else beside it", () => {
  // Centred above the pick it would run under the navigator, and so below it; beside it, right of the pick, it is clear.
  const navigator = box(8, 40, 264, 300);
  assert.deepEqual(placeBar({ box: box(270, 150, 330, 200), size: SIZE, bounds: BOUNDS, obstacles: [navigator] }), { left: 340, top: 161 });
  // Where the right is taken too (a dialog beside the pick), the left of the pick is what is left.
  const dialog = box(330, 100, 592, 300);
  assert.deepEqual(placeBar({ box: box(270, 150, 330, 200), size: SIZE, bounds: BOUNDS, obstacles: [dialog] }), { left: 60, top: 161 });
  // A card above the pick, and the bar goes below it.
  assert.deepEqual(placeBar({ box: box(250, 200, 350, 260), size: SIZE, bounds: BOUNDS, obstacles: [box(100, 150, 500, 190)] }), { left: 200, top: 270 });
});

test("sits over a pick that fills the view, held inside it, where nothing beside it is free", () => {
  const placed = placeBar({ box: box(-100, -50, 700, 500), size: SIZE, bounds: BOUNDS });
  assert.deepEqual(placed, { left: 200, top: 40 });
});

test("is nowhere for a pick out of the view", () => {
  assert.equal(placeBar({ box: box(-300, 100, -100, 200), size: SIZE, bounds: BOUNDS }), null);
  assert.equal(placeBar({ box: box(100, 450, 200, 500), size: SIZE, bounds: BOUNDS }), null);
  assert.equal(placeBar({ box: null, size: SIZE, bounds: BOUNDS }), null);
});

test("takes the corners of a box of the model, where the model's matrix puts them", () => {
  const corners = boundsCorners({ min: [0, 0, 0], max: [2, 4, 6] });
  assert.equal(corners.length, 8);
  assert.deepEqual(corners.map(corner => corner.join()).sort(), ["0,0,0", "0,0,6", "0,4,0", "0,4,6", "2,0,0", "2,0,6", "2,4,0", "2,4,6"]);
  // A matrix as three.js lays its 16 numbers out, column by column: a move by (10, 20, 30).
  const move = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1];
  assert.deepEqual(boundsCorners({ min: [0, 0, 0], max: [1, 1, 1] }, move).map(corner => corner.join()).sort()[0], "10,20,30");
  // No box, no corners.
  assert.deepEqual(boundsCorners(null), []);
  assert.deepEqual(boundsCorners({ min: [0, 0], max: [1, 1] }), []);
});

test("puts the model's points on the screen where the camera sees them, the model group's place included", () => {
  // A 600 × 400 view, an orthographic camera straight over it, one pixel a unit: (x, y, 0) falls at (300 + x, 200 − y).
  const camera = new THREE.OrthographicCamera(-300, 300, 200, -200, 0.1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const modelGroup = new THREE.Group();
  const runtime = { THREE, camera, modelGroup };
  const plate = [[-50, -20, 0], [50, -20, 0], [-50, 20, 0], [50, 20, 0]];
  const rounded = box => box && Object.fromEntries(Object.entries(box).map(([edge, value]) => [edge, Math.round(value * 1000) / 1000]));
  assert.deepEqual(rounded(screenBox(runtime, plate, 600, 400)), { left: 250, top: 180, right: 350, bottom: 220 });
  // The model sits under a group that moves it (the part is centred in the view), and the box moves with it.
  modelGroup.position.set(10, -30, 0);
  modelGroup.updateMatrixWorld();
  assert.deepEqual(rounded(screenBox(runtime, plate, 600, 400)), { left: 260, top: 210, right: 360, bottom: 250 });
  // Behind the camera, or out past what it sees, is nowhere; with some of the points in front, the box is theirs.
  assert.equal(screenBox(runtime, [[0, 0, 500]], 600, 400), null);
  assert.equal(screenBox(runtime, [], 600, 400), null);
  assert.deepEqual(rounded(screenBox(runtime, [...plate, [0, 0, 500]], 600, 400)), { left: 260, top: 210, right: 360, bottom: 250 });
});
