import { describe, expect, it } from "vite-plus/test";

import { skillBody } from "./SkillDetail";

describe("a skill's instructions", () => {
  it("leave out the front matter that names it", () => {
    expect(skillBody("---\nname: a\ndescription: b\n---\n\n# Steps\n")).toBe("# Steps\n");
    expect(skillBody("# No front matter\n")).toBe("# No front matter\n");
  });
});
