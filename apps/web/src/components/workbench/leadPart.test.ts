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

  it("is null when no folder has a part, or while one is still read", () => {
    expect(leadPartOf([])).toBeNull();
    expect(leadPartOf([{ root: "/work/a", paths: ["README.md", "docs/plan.md"] }])).toBeNull();
    expect(leadPartOf([{ root: "/work/a", paths: null }])).toBeNull();
  });
});
