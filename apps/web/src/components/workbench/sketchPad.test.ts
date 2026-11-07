import { describe, expect, it } from "vite-plus/test";

import {
  describeSketch,
  moveSketchShape,
  type SketchShape,
  sketchDocument,
  sketchShapeFromDrag,
  snapToSketchGrid,
} from "./sketchPad";

const plate: SketchShape = { kind: "rectangle", from: { x: 40, y: 60 }, to: { x: 400, y: 260 } };
const width: SketchShape = {
  kind: "dimension",
  from: { x: 40, y: 300 },
  to: { x: 400, y: 300 },
  value: "80 mm",
};

describe("sketchPad", () => {
  it("snaps to half a grid square and stays on the sheet", () => {
    expect(snapToSketchGrid({ x: 37, y: 12 })).toEqual({ x: 40, y: 10 });
    expect(snapToSketchGrid({ x: -30, y: 900 })).toEqual({ x: 0, y: 600 });
  });

  it("makes no shape from a click that did not drag", () => {
    const point = { x: 40, y: 40 };
    expect(sketchShapeFromDrag("rectangle", point, point)).toBeNull();
    expect(sketchShapeFromDrag("circle", point, { x: 80, y: 40 })).toEqual({
      kind: "circle",
      centre: point,
      edge: { x: 80, y: 40 },
    });
  });

  it("moves every point of a shape, keeping its typed number", () => {
    expect(moveSketchShape(width, 20, -40)).toEqual({
      kind: "dimension",
      from: { x: 60, y: 260 },
      to: { x: 420, y: 260 },
      value: "80 mm",
    });
  });

  it("describes the sketch with the typed numbers as the only sizes", () => {
    const words = describeSketch([
      plate,
      width,
      { kind: "text", at: { x: 500, y: 100 }, value: "M4, 4 places" },
    ]);
    expect(words).toContain("not to scale");
    expect(words).toContain("Rectangle from (2, 3) to (20, 13)");
    expect(words).toContain("Dimension 80 mm from (2, 15) to (20, 15)");
    expect(words).toContain("Note at (25, 5): M4, 4 places");
  });

  it("escapes what the engineer types, so a note can't break the picture", () => {
    const sheet = sketchDocument([{ kind: "text", at: { x: 0, y: 0 }, value: 'a < b & "c"' }]);
    expect(sheet).toContain("a &lt; b &amp; &quot;c&quot;");
  });
});
