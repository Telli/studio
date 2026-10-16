import { describe, expect, it } from "vite-plus/test";

import { formatLength, type Sketch, sketchDimensions, toWorld } from "./dimensions";

const XY = { origin: [0, 0, 0], x_dir: [1, 0, 0], y_dir: [0, 1, 0] } as const;
// SolidCraft's XZ plane: sketch y runs along world -Z.
const XZ = { origin: [0, 0, 0], x_dir: [1, 0, 0], y_dir: [0, 0, -1] } as const;

/** The plate's outline as SolidCraft reports it: a 75 x 40 rectangle with its width and depth. */
const plate: Sketch = {
  id: 2,
  name: "PlateSketch",
  plane: XY,
  points: [
    { id: "origin", at: [0, 0] },
    { id: "p1", at: [-37.5, -20] },
    { id: "p2", at: [37.5, -20] },
    { id: "p3", at: [37.5, 20] },
    { id: "p4", at: [-37.5, 20] },
  ],
  curves: [
    { id: "l1", type: "line", start_at: [-37.5, -20], end_at: [37.5, -20] },
    { id: "l2", type: "line", start_at: [37.5, -20], end_at: [37.5, 20] },
    { id: "l3", type: "line", start_at: [37.5, 20], end_at: [-37.5, 20] },
    { id: "l4", type: "line", start_at: [-37.5, 20], end_at: [-37.5, -20] },
  ],
  constraints: [
    { id: "k1", type: "horizontal", l: 0 },
    { id: "k7", type: "length", l: 1, param: "d1", expression: "depth", value: 40 },
    { id: "k8", type: "length", l: 0, param: "d2", expression: "width", value: 75 },
  ],
};

describe("model dimensions", () => {
  it("places a sketch point in the world through its plane", () => {
    expect(toWorld(XZ, [15, 15])).toEqual([15, 0, -15]);
  });

  it("writes lengths the way a drawing does", () => {
    expect(formatLength(75)).toBe("75");
    expect(formatLength(31.5)).toBe("31.5");
    expect(formatLength(6.35)).toBe("6.35");
    expect(formatLength(2.0000001)).toBe("2");
  });

  it("draws each driving dimension outside the outline, by its parameter", () => {
    const [depth, width] = sketchDimensions(plate);
    expect(width).toMatchObject({ param: "d2", expression: "width", label: "75", kind: "length" });
    // The bottom edge's width sits below it, away from the rectangle's middle.
    expect(width!.anchor[1]).toBeLessThan(-20);
    expect(width!.anchor[0]).toBeCloseTo(0);
    // The right edge's depth sits to its right.
    expect(depth!.anchor[0]).toBeGreaterThan(37.5);
    expect(depth!.lines).toHaveLength(3);
    // Constraints without a value (horizontal) are not dimensions.
    expect(sketchDimensions(plate)).toHaveLength(2);
  });

  it("labels diameters, radii and angles, and measures along an axis", () => {
    const sketch: Sketch = {
      id: 1,
      name: "S",
      plane: XZ,
      points: [
        { id: "origin", at: [0, 0] },
        { id: "c1.center", at: [0, -10] },
        { id: "c2.center", at: [30, -10] },
      ],
      curves: [
        { id: "c1", type: "circle", center_at: [0, -10], radius: 5 },
        { id: "c2", type: "circle", center_at: [30, -10], radius: 4 },
        { id: "l1", type: "line", start_at: [0, 0], end_at: [20, 0] },
        { id: "l2", type: "line", start_at: [0, 0], end_at: [15, 15] },
      ],
      constraints: [
        { id: "k1", type: "diameter", c: 0, param: "d1", expression: "10", value: 10 },
        { id: "k2", type: "radius", c: 1, param: "d2", expression: "4", value: 4 },
        { id: "k3", type: "distance", p: 1, q: 2, param: "d3", expression: "30", value: 30 },
        {
          id: "k6",
          type: "angle",
          a: 2,
          b: 3,
          param: "d4",
          expression: "45 deg",
          value: Math.PI / 4,
        },
        { id: "k7", type: "distance_y", p: 0, q: 1, param: "d5", expression: "10", value: 10 },
      ],
    };
    const byParam = Object.fromEntries(sketchDimensions(sketch).map((d) => [d.param, d]));
    expect(byParam.d1).toMatchObject({ label: "Ø10" });
    expect(byParam.d2).toMatchObject({ label: "R4" });
    expect(byParam.d3).toMatchObject({ label: "30" });
    expect(byParam.d4).toMatchObject({ label: "45°", value: 45 });
    expect(byParam.d5).toMatchObject({ label: "10" });
    // The angle's label sits between its lines, off the vertex: in the world, at y 0 on the XZ plane.
    expect(byParam.d4!.anchor[1]).toBeCloseTo(0);
    expect(byParam.d4!.anchor[0]).toBeGreaterThan(0);
    // The vertical distance runs along the sketch's y, so its two ends share a sketch x.
    const [, , dimensionLine] = byParam.d5!.lines;
    expect(dimensionLine![0][0]).toBeCloseTo(dimensionLine![1][0]);
  });
});
