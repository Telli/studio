import assert from "node:assert/strict";
import test from "node:test";

import { lightText } from "./sketchDrawing.js";

import {
  chainOf,
  countChange,
  dimensionFor,
  dimensionLayout,
  drawOp,
  extendPiece,
  formatValue,
  patternCopies,
  patternOp,
  patternSettings,
  hitTest,
  inferLine,
  polygonCorners,
  polygonSides,
  relationsFor,
  relationsOn,
  sketchGeometry,
  sketchNote,
  snap,
  tangentArc,
  tangentStart,
  threePointArc,
  toolSize,
  trimPiece
} from "./sketchMode.js";

// A 40 by 20 rectangle from the origin, with a circle in it, as the server solves one.
const STATE = {
  points: [
    { id: "Origin", x: 0, y: 0, fixed: true },
    { id: "Point1", x: 0, y: 0 },
    { id: "Point2", x: 40, y: 0 },
    { id: "Point3", x: 40, y: 20 },
    { id: "Point4", x: 0, y: 20 },
    { id: "Point5", x: 30, y: 10 },
  ],
  curves: [
    { id: "Line1", kind: "line", start: "Point1", end: "Point2" },
    { id: "Line2", kind: "line", start: "Point2", end: "Point3" },
    { id: "Line3", kind: "line", start: "Point3", end: "Point4" },
    { id: "Line4", kind: "line", start: "Point4", end: "Point1" },
    { id: "Circle1", kind: "circle", center: "Point5", radius: 4 },
  ],
  relations: [{ id: "Horizontal1", kind: "horizontal", refs: ["Line1"] }],
  dimensions: [{ id: "D1", kind: "length", refs: ["Line1"], value: 40 }],
};

test("a click lands on a point before a midpoint, and on a midpoint before a curve", () => {
  assert.deepEqual(snap(STATE, [40.3, 0.2], 1), { point: "Point2", at: [40, 0] });
  assert.deepEqual(snap(STATE, [20.2, 0.3], 1), { at: [20, 0], on: "Line1", midpoint: true });
  assert.deepEqual(snap(STATE, [10, 0.4], 1), { at: [10, 0], on: "Line1" });
  assert.deepEqual(snap(STATE, [34.2, 10], 1), { at: [34, 10], on: "Circle1" });
  assert.deepEqual(snap(STATE, [12, 12], 1), { at: [12, 12] });
  // A stroke's own start is not where it ends.
  assert.deepEqual(snap(STATE, [40, 0.5], 1, { exclude: ["Point2"] }), { at: [40, 0.5], on: "Line2" });
});

test("a line drawn near level or plumb is drawn so, and kept so", () => {
  assert.deepEqual(inferLine([0, 0], [10, 0.4]), { end: [10, 0], relation: "horizontal" });
  assert.deepEqual(inferLine([0, 0], [-0.3, 8]), { end: [0, 8], relation: "vertical" });
  assert.deepEqual(inferLine([0, 0], [10, 5]), { end: [10, 5], relation: null });
});

test("each tool sends what it drew, sharing the points it landed on", () => {
  const line = drawOp("line", [{ point: "Point3", at: [40, 20] }, { at: [60, 20.5] }], STATE);
  assert.deepEqual(line, { kind: "draw", entity: "line", start: { point: "Point3" }, end: { at: [60, 20] }, relations: [{ kind: "horizontal" }] });
  const onCurve = drawOp("line", [{ at: [50, 0] }, { at: [40, 10], on: "Line2" }], STATE);
  assert.deepEqual(onCurve.end, { at: [40, 10], on: "Line2" });
  assert.deepEqual(onCurve.relations, []);
  const circle = drawOp("circle", [{ at: [5, 5] }, { at: [8, 9] }], STATE, { construction: true });
  assert.deepEqual(circle, { kind: "draw", entity: "circle", center: { at: [5, 5] }, radius: 5, construction: true });
  const arc = drawOp("arc", [{ at: [0, 0] }, { at: [10, 0] }, { at: [0, 4] }], STATE);
  assert.deepEqual(arc.end, { at: [0, 10] });
  const slot = drawOp("slot", [{ at: [0, 0] }, { at: [30, 0] }, { at: [10, 6] }], STATE);
  assert.equal(slot.radius, 6);
});

test("Smart Dimension makes the dimension SolidWorks makes of what is picked", () => {
  assert.deepEqual(dimensionFor(STATE, ["Line1"]), { dimension: "length", refs: ["Line1"], value: 40 });
  assert.deepEqual(dimensionFor(STATE, ["Circle1"]), { dimension: "diameter", refs: ["Circle1"], value: 8 });
  // A point and a circle, placed above them: the horizontal distance to its center.
  assert.deepEqual(dimensionFor(STATE, ["Point1", "Circle1"], [15, 30]), { dimension: "horizontal_distance", refs: ["Point1", "Point5"], value: 30 });
  assert.deepEqual(dimensionFor(STATE, ["Point1", "Circle1"], [50, 5]), { dimension: "vertical_distance", refs: ["Point1", "Point5"], value: 10 });
  assert.equal(dimensionFor(STATE, ["Point1", "Circle1"], [15, 5]).dimension, "distance");
  assert.deepEqual(dimensionFor(STATE, ["Line1", "Line3"]), { dimension: "distance", refs: ["Line1", "Line3"], value: 20 });
  assert.equal(Math.round(dimensionFor(STATE, ["Line1", "Line2"]).value), 90);
  assert.deepEqual(dimensionFor(STATE, ["Circle1", "Line2"]), { dimension: "distance", refs: ["Point5", "Line2"], value: 10 });
});

test("Add Relations offers what the selection can take", () => {
  const offered = selection => relationsFor(STATE, selection).map(each => each.relation);
  assert.deepEqual(offered(["Line1"]), ["horizontal", "vertical"]);
  assert.deepEqual(offered(["Line1", "Line2"]), ["parallel", "perpendicular", "equal"]);
  assert.deepEqual(offered(["Point5", "Line1"]), ["coincident", "midpoint"]);
  assert.deepEqual(offered(["Line2", "Circle1"]), ["tangent"]);
  assert.deepEqual(offered(["Point1", "Point5", "Line2"]), ["symmetric"]);
  assert.deepEqual(offered(["Origin"]), []);
  assert.deepEqual(relationsOn(STATE, ["Line1"]).map(each => each.id), ["Horizontal1", "D1"]);
});

test("a dimension is drawn off the side away from the shape, its value beyond", () => {
  const length = dimensionLayout(STATE, STATE.dimensions[0], 4);
  assert.deepEqual(length.dimension, [[0, -4], [40, -4]]);
  assert.ok(length.anchor[1] < -4);
  const diameter = dimensionLayout(STATE, { id: "D2", kind: "diameter", refs: ["Circle1"] }, 4);
  assert.equal(Math.round(Math.hypot(diameter.dimension[0][0] - diameter.dimension[1][0], diameter.dimension[0][1] - diameter.dimension[1][1])), 8);
  assert.equal(formatValue(8, "mm", "diameter"), "Ø8");
  assert.equal(formatValue(1.25, "in", "length"), "1.25");
  assert.equal(formatValue(89.99, "mm", "angle"), "90°");
});

test("what is under the pointer: a point before the curves it joins", () => {
  assert.equal(hitTest(STATE, [40.1, 0.1], 0.5), "Point2");
  assert.equal(hitTest(STATE, [40.1, 10], 0.5), "Line2");
  assert.equal(hitTest(STATE, [26.1, 10], 0.5), "Circle1");
  assert.equal(hitTest(STATE, [20, 10], 0.5), null);
});

test("leaving a sketch tells the agent what was drawn, counted", () => {
  let made = {};
  for (const op of [{ kind: "draw", entity: "rectangle" }, { kind: "draw", entity: "circle" }, { kind: "dimension" }, { kind: "dimension" }]) {
    made = countChange(made, op);
  }
  assert.equal(sketchNote({ name: "Sketch2", file: "parts/plate.py", line: 12, plane: "Top", created: true, made }),
    "In edit mode I drew Sketch2 on the Top Plane (parts/plate.py, line 12): drew 4 lines and a circle, added 2 dimensions.");
  assert.equal(sketchNote({ name: "Sketch1", file: "plate.py", line: 9, made: countChange({}, { kind: "delete", items: ["Line2"] }) }),
    "In edit mode I changed Sketch1 (plate.py, line 9): deleted an item.");
});

test("Trim cuts away the piece between the curves that cross it, or the whole curve", () => {
  // A line from (10, -5) to (10, 25) crosses the rectangle's bottom and top.
  const crossed = { ...STATE, points: [...STATE.points, { id: "Point6", x: 10, y: -5 }, { id: "Point7", x: 10, y: 25 }],
    curves: [...STATE.curves, { id: "Line5", kind: "line", start: "Point6", end: "Point7" }] };
  const middle = trimPiece(crossed, "Line1", [5, 0]);
  assert.deepEqual(middle.points.map(place => place.map(value => Math.round(value * 1000) / 1000)), [[0, 0], [10, 0]]);
  assert.equal(middle.whole, false);
  const between = trimPiece(crossed, "Line5", [10, 10]);
  assert.deepEqual(between.points.map(place => place.map(value => Math.round(value))), [[10, 0], [10, 20]]);
  // Nothing crosses the circle: it goes whole.
  assert.equal(trimPiece(crossed, "Circle1", [34, 10]).whole, true);
});

test("Offset's Select chain takes the curves joined end to end, a circle on its own", () => {
  assert.deepEqual(chainOf(STATE, "Line2"), ["Line2", "Line1", "Line3", "Line4"]);
  assert.deepEqual(chainOf(STATE, "Circle1"), ["Circle1"]);
});

test("a fillet's arc is drawn from the places the server works out, its lines up to it", () => {
  const filleted = { ...STATE, curves: [
    { ...STATE.curves[0], shown: [[0, 0], [38, 0]] },
    ...STATE.curves.slice(1),
    { id: "Fillet1", kind: "arc", derived: "fillet", dimension: "D2", c: [38, 2], s: [38, 0], e: [40, 2], radius: 2, clockwise: false },
  ], dimensions: [...STATE.dimensions, { id: "D2", kind: "fillet", refs: ["Line1", "Line2"], value: 2, data: { arc: "Fillet1", corner: "Point2" } }] };
  const geometry = sketchGeometry(filleted);
  assert.deepEqual(geometry.curves[0].view, [[0, 0], [38, 0]]);
  assert.equal(geometry.curves.at(-1).derived, "fillet");
  // Picked, it is no line to relate or dimension; its R dimension sits on it.
  assert.deepEqual(relationsFor(filleted, ["Fillet1", "Line3"]), []);
  assert.equal(dimensionFor(filleted, ["Fillet1"]), null);
  assert.equal(formatValue(2, "mm", "fillet"), "R2");
  assert.ok(dimensionLayout(filleted, filleted.dimensions[1], 2).single);
  // The tools start from a size in the part's units until one is typed.
  assert.equal(toolSize("", "in", "fillet"), "0.1");
  assert.equal(toolSize("WALL", "in", "offset"), "WALL");
});

test("the note says what the sketch tools did", () => {
  let made = {};
  for (const op of [{ kind: "fillet" }, { kind: "fillet" }, { kind: "trim" }, { kind: "offset" }, { kind: "mirror", items: ["Line1", "Line2"] }]) made = countChange(made, op);
  assert.equal(sketchNote({ name: "Sketch1", file: "plate.py", line: 9, made }),
    "In edit mode I changed Sketch1 (plate.py, line 9): rounded 2 corners, trimmed a curve, offset a chain, mirrored 2 entities.");
  // Convert Entities, counted by what was picked on the model: its edges, and its faces.
  made = countChange({}, { kind: "convert", items: [{ selector: "e4" }, { selector: "e7" }, { selector: "f2" }] });
  assert.equal(sketchNote({ name: "Sketch2", file: "plate.py", line: 12, made }),
    "In edit mode I changed Sketch2 (plate.py, line 12): converted 2 edges and a face of the model.");
  // Intersection Curve: the part's section on the sketch's plane.
  assert.equal(sketchNote({ name: "Sketch3", file: "plate.py", line: 15, made: countChange({}, { kind: "intersection" }) }),
    "In edit mode I changed Sketch3 (plate.py, line 15): brought in where the part crosses its plane.");
});

test("a dark viewer is told by its light text, written as oklch or rgb", () => {
  assert.equal(lightText("oklch(0.985 0 0)"), true);
  assert.equal(lightText("oklch(14.5% 0 0)"), false);
  assert.equal(lightText("rgb(250, 250, 250)"), true);
  assert.equal(lightText("rgb(20, 20, 20)"), false);
});

test("a 3 Point Arc bows through its middle click, a Tangent Arc leaves a line's end along it, and a Polygon goes round its center", () => {
  const round = values => values.map(value => Math.round(value * 1e6) / 1e6 || 0);
  // Over a chord from (20, 0) to the origin through (10, 10): half a circle, counterclockwise; under it, the other way round.
  const over = threePointArc([20, 0], [10, 10], [0, 0]);
  assert.deepEqual([round(over.center), Math.round(over.radius * 1e6) / 1e6, Math.round(over.sweep * 1e6) / 1e6], [[10, 0], 10, 3.141593]);
  assert.ok(threePointArc([20, 0], [10, -10], [0, 0]).sweep < 0);
  assert.equal(threePointArc([0, 0], [1, 0], [2, 0]), null);
  // On from Line1's end at (40, 0) up to (40, 10): a half circle to the left, counterclockwise; back from its start, clockwise.
  const on = tangentArc(STATE, { point: "Point2" }, [40, 10]);
  assert.deepEqual([on.from, round(on.center), on.clockwise, on.radius], ["Line1", [40, 5], false, 5]);
  assert.deepEqual(tangentStart(STATE, { point: "Point2" }), { from: "Line1", start: [40, 0], way: [1, 0] });
  assert.equal(tangentStart(STATE, { at: [3, 3] }), null);
  assert.deepEqual(drawOp("tangent_arc", [{ point: "Point2", at: [40, 0] }, { at: [40, 10] }], STATE),
    { kind: "draw", entity: "arc", center: { at: [40, 5] }, start: { point: "Point2" }, end: { at: [40, 10] }, clockwise: false, tangent: "Line1" });
  assert.deepEqual(drawOp("three_point_arc", [{ at: [0, 0] }, { at: [20, 0] }, { at: [10, 10] }], STATE),
    { kind: "draw", entity: "three_point_arc", start: { at: [0, 0] }, end: { at: [20, 0] }, through: { at: [10, 10] } });
  assert.deepEqual(polygonCorners([0, 0], [10, 0], 4).map(round), [[10, 0], [0, 10], [-10, 0], [0, -10]]);
  assert.equal(drawOp("polygon", [{ point: "Origin" }, { at: [10, 0] }], STATE, { sides: "8" }).sides, 8);
  assert.deepEqual(["", "2", "12", "6.5"].map(polygonSides), [6, 6, 12, 6]);
  assert.deepEqual(countChange({}, { kind: "draw", entity: "polygon", sides: 8 }), { line: 8 });
});

test("a sketch chamfer's line is read as a line from its places, its distance drawn along the line it cuts", () => {
  // The rectangle's corner at (40, 20) cut 2 back along each line, as the server solves it.
  const state = {
    ...STATE,
    curves: [...STATE.curves, { id: "Chamfer1", kind: "line", derived: "chamfer", dimension: "D1", s: [40, 18], e: [38, 20] }],
    dimensions: [{ id: "D1", kind: "chamfer", refs: ["Line2", "Line3"], value: 2, data: { corner: "Point3", line: "Chamfer1" } }],
  };
  const cut = sketchGeometry(state).curves.find(curve => curve.id === "Chamfer1");
  assert.deepEqual([cut.kind, cut.a, cut.b, cut.derived], ["line", [40, 18], [38, 20], "chamfer"]);
  // Along Line2, from the corner down to where the chamfer meets it, off to the right of the shape.
  const placed = dimensionLayout(state, state.dimensions[0], 5);
  assert.ok(placed.dimension.every(([x]) => x > 40));
  assert.equal(formatValue(2, "mm", "chamfer"), "2");
  // Its line is nothing to land on: a click on its middle lands on the line beside it.
  const landed = snap(state, [39, 19], 1.2);
  assert.deepEqual([landed.on, landed.midpoint], ["Line2", undefined]);
  assert.match(sketchNote({ name: "Sketch1", file: "a.py", line: 3, made: countChange({}, { kind: "chamfer", corner: "Point3", distance: "2" }) }),
    /cut a corner/);
});

test("Extend runs a free line's end on to the first curve ahead, and leaves a joined end alone", () => {
  // A free line inside the rectangle, from (5, 5) to (10, 5): run on, it meets the right side at (40, 5).
  const state = {
    ...STATE,
    points: [...STATE.points, { id: "Point6", x: 5, y: 5 }, { id: "Point7", x: 10, y: 5 }],
    curves: [...STATE.curves, { id: "Line5", kind: "line", start: "Point6", end: "Point7" }],
  };
  assert.deepEqual(extendPiece(state, "Line5", [9, 5]), { id: "Line5", points: [[10, 5], [40, 5]] });
  // From its start, back to the left side.
  assert.deepEqual(extendPiece(state, "Line5", [6, 5]).points, [[5, 5], [0, 5]]);
  // The rectangle's own lines share their corners.
  assert.equal(extendPiece(state, "Line1", [39, 0]), null);
  assert.match(sketchNote({ name: "Sketch1", file: "a.py", line: 3, made: countChange({}, { kind: "extend", curve: "Line5" }) }), /extended a line/);
});

test("a sketch pattern takes what is selected, draws its copies where they go, and sends its settings", () => {
  // The circle in the rectangle, three in a row 10 apart along X; then six round the point picked last.
  const linear = patternSettings("linear_pattern", { linearSpacing: "10" }, ["Circle1"], STATE, "mm");
  assert.deepEqual(linear, { type: "linear", items: ["Circle1"], count: 3, spacing: "10", angle: "0" });
  assert.deepEqual(patternCopies(STATE, linear).map(copy => copy.c.map(Math.round)), [[40, 10], [50, 10]]);
  assert.deepEqual(patternOp(linear), { kind: "pattern", type: "linear", items: ["Circle1"], count: "3", spacing: "10", angle: "0" });
  const circular = patternSettings("circular_pattern", { circularCount: "4" }, ["Circle1", "Point1"], STATE, "mm");
  assert.deepEqual(circular, { type: "circular", items: ["Circle1"], count: 4, angle: "360", center: "Point1" });
  // A quarter turn about the rectangle's corner at the origin: (30, 10) to (-10, 30).
  assert.deepEqual(patternCopies(STATE, circular)[0].c.map(value => Math.round(value)), [-10, 30]);
  assert.deepEqual(patternOp(circular), { kind: "pattern", type: "circular", items: ["Circle1"], count: "4", angle: "360", center: "Point1" });
  // A spacing written as a size's name is not drawn ahead.
  assert.deepEqual(patternCopies(STATE, { ...linear, spacing: "PITCH" }), []);
  assert.deepEqual(countChange({}, { kind: "pattern" }), { pattern: 1 });
  // Its spacing drawn from the circle's center to its first copy's.
  const state = { ...STATE, points: [...STATE.points, { id: "Point6", x: 40, y: 10 }],
    dimensions: [{ id: "D1", kind: "linear_pattern", refs: ["Circle1"], value: 10, data: { pairs: [["Point5", "Point6", 1]], angle: 0 } }] };
  const placed = dimensionLayout(state, state.dimensions[0], 5);
  assert.ok(placed.dimension.every(([, y]) => y !== 10));
  assert.equal(formatValue(360, "mm", "circular_pattern"), "360°");
});
