import { describe, expect, it } from "vite-plus/test";

import { leadPartOf } from "./leadPart";

describe("leadPartOf", () => {
  it("takes the first part of the first folder that has one", () => {
    const lead = leadPartOf([
      { root: "/work/notes", paths: ["README.md", "docs/plan.md"] },
      { root: "/work/hook", paths: ["parts/hook.step", "parts/plate.step"] },
    ]);
    expect(lead?.root).toBe("/work/hook");
    expect(lead?.file.path).toBe("parts/hook.step");
  });

  it("leads with the part the others are named after, whichever is listed first", () => {
    const lead = leadPartOf([
      {
        root: "/work/bracket",
        paths: ["parts/bracket_flat.step", "parts/bracket-v2.step", "parts/bracket.step"],
      },
    ]);
    expect(lead?.file.path).toBe("parts/bracket.step");
    // Names that only share their start are parts of their own.
    expect(
      leadPartOf([{ root: "/work/a", paths: ["parts/bracketry.step", "parts/bracket.step"] }])?.file
        .path,
    ).toBe("parts/bracketry.step");
  });

  it("leads with what was built last, an assembly ahead of the parts built with it", () => {
    const model = (id: string, kind: "Part" | "Assembly", updated: string) => ({
      id,
      name: id,
      script: `parts/${id}.py`,
      kind,
      updated,
    });
    const older = model("frame", "Part", "100");
    const newer = model("carriage", "Part", "200");
    const whole = model("plotter", "Assembly", "200");
    expect(leadPartOf([{ root: "/w", paths: [], models: [older, newer] }])?.file.path).toBe(
      "carriage",
    );
    expect(leadPartOf([{ root: "/w", paths: [], models: [newer, whole, older] }])?.file.path).toBe(
      "plotter",
    );
    // Across folders too, wherever the first folder's parts are.
    expect(
      leadPartOf([
        { root: "/a", paths: [], models: [older] },
        { root: "/b", paths: [], models: [newer] },
      ])?.root,
    ).toBe("/b");
  });

  it("is null when no folder has a part, or while one is still read", () => {
    expect(leadPartOf([])).toBeNull();
    expect(leadPartOf([{ root: "/work/a", paths: ["README.md", "docs/plan.md"] }])).toBeNull();
    expect(leadPartOf([{ root: "/work/a", paths: null }])).toBeNull();
  });
});
