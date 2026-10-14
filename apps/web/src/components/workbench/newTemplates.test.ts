import { describe, expect, it } from "vite-plus/test";

import { availableTemplates, fileStem, NEW_TEMPLATES, newWorkPrompt } from "./newTemplates";

const template = (id: string) => NEW_TEMPLATES.find((entry) => entry.id === id)!;

describe("new templates", () => {
  it("offers only what the installed skills can do; documents need none", () => {
    expect(availableTemplates(new Set(["cad"])).map((entry) => entry.id)).toEqual([
      "part",
      "assembly",
      "sheet-metal",
      "test-plan",
      "instructions",
    ]);
    expect(
      availableTemplates(new Set(["fea", "cam", "pcb"])).map((entry) => entry.label),
    ).toContain("Strength study");
  });

  it("names new work by a file name the agent can use", () => {
    expect(fileStem("  Wall Bracket (rev B) ")).toBe("wall_bracket_rev_b");
    expect(fileStem("***")).toBe("untitled");
    expect(
      newWorkPrompt({
        template: template("part"),
        name: "Wall bracket",
        folder: "parts/",
        units: "mm",
        part: null,
        description: "80 mm wide, two M5 holes",
      }),
    ).toBe("Create a new part, parts/wall_bracket, in millimeters. 80 mm wide, two M5 holes.");
  });

  it("works from the chosen part for a study, a CAM job or a drawing", () => {
    const work = { name: "", folder: "", units: "in" as const, description: "" };
    expect(
      newWorkPrompt({
        ...work,
        template: template("strength-study"),
        part: "parts/STEP/l_bracket.step",
      }),
    ).toMatch(/^Run a strength study on parts\/STEP\/l_bracket\.step\. Ask me for the loads/);
    expect(
      newWorkPrompt({ ...work, template: template("drawing"), part: "parts/STEP/l_bracket.step" }),
    ).toContain("in inches.");
  });
});
