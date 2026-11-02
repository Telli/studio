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

  it("is null when no folder has a part, or while one is still read", () => {
    expect(leadPartOf([])).toBeNull();
    expect(leadPartOf([{ root: "/work/a", paths: ["README.md", "docs/plan.md"] }])).toBeNull();
    expect(leadPartOf([{ root: "/work/a", paths: null }])).toBeNull();
  });
});
