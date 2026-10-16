import { describe, expect, it } from "vite-plus/test";

import {
  buildSummary,
  type DesignParameter,
  designPanels,
  featureKind,
  formatValue,
  restatesValue,
  type TimelineEntry,
} from "./designState";

const parameter = (overrides: Partial<DesignParameter> & { name: string }): DesignParameter => ({
  expression: "1 mm",
  value: 1,
  unit: "mm",
  source: "user",
  feature: null,
  input: null,
  error: null,
  ...overrides,
});
const entry = (id: number, name: string, type: string, extra: Partial<TimelineEntry> = {}) => ({
  id,
  name,
  type,
  error: null,
  warning: null,
  suppressed: false,
  rolled_back: false,
  ...extra,
});

describe("design state", () => {
  it("names features plainly", () => {
    expect(featureKind("ExtrudeFeature")).toBe("Extrude");
    expect(featureKind("RectangularPatternFeature")).toBe("Rectangular pattern");
    expect(featureKind("Sketch")).toBe("Sketch");
  });

  it("writes values with their units and says an expression once", () => {
    expect(formatValue(75, "mm")).toBe("75 mm");
    expect(formatValue(2, "")).toBe("2");
    expect(formatValue(45, "deg")).toBe("45°");
    expect(restatesValue({ expression: "75 mm", value: 75, unit: "mm" })).toBe(true);
    expect(restatesValue({ expression: "width - 2*inset", value: 63, unit: "mm" })).toBe(false);
  });

  it("lists named sizes, then each feature with its own inputs in timeline order", () => {
    const { named, features } = designPanels(
      [
        parameter({ name: "width", expression: "75 mm", value: 75 }),
        parameter({ name: "d2", source: "sketch", expression: "width" }),
        parameter({ name: "d3", source: "feature", feature: "Plate", input: "Distance" }),
        parameter({ name: "d12", source: "feature", feature: "Corners", input: "Radius" }),
      ],
      [
        entry(2, "PlateSketch", "Sketch"),
        entry(3, "Plate", "ExtrudeFeature"),
        entry(7, "Corners", "FilletFeature"),
      ],
    );
    expect(named.map((p) => p.name)).toEqual(["width"]);
    expect(features.map((f) => [f.name, f.kind, f.inputs.map((i) => i.input)])).toEqual([
      ["PlateSketch", "Sketch", []],
      ["Plate", "Extrude", ["Distance"]],
      ["Corners", "Fillet", ["Radius"]],
    ]);
  });

  it("says how the design built, leaving out suppressed features", () => {
    expect(buildSummary([entry(1, "A", "Sketch")])).toEqual({ text: "Built", tone: "ok" });
    expect(
      buildSummary([
        entry(1, "A", "ExtrudeFeature", { error: "no profile" }),
        entry(2, "B", "FilletFeature", { error: "edge gone", suppressed: true }),
      ]),
    ).toEqual({ text: "1 feature failed", tone: "error" });
  });
});
