import { describe, expect, it } from "vite-plus/test";

import { EMPTY_BRIEF } from "./briefFolder";
import { groupProjectFiles } from "./projectFiles";
import {
  PROJECT_TEMPLATES,
  agentsWithLayout,
  newProjectBrief,
  parseStudioProject,
  readProjectBrief,
  studioProjectJson,
} from "./studioProject";

const board = PROJECT_TEMPLATES.find((template) => template.id === "board")!;
const blank = PROJECT_TEMPLATES.find((template) => template.id === "blank")!;

describe("studio.json", () => {
  it("round-trips a project with its brief", () => {
    const brief = newProjectBrief({
      template: board,
      units: "in",
      material: " FR-4 ",
      purpose: "A sensor breakout",
    });
    const json = studioProjectJson({ name: "Sensor pendant", template: "board", brief });
    expect(parseStudioProject(json)).toEqual({
      name: "Sensor pendant",
      template: "board",
      brief: {
        ...EMPTY_BRIEF,
        units: "in",
        material: "FR-4",
        process: "Printed circuit board",
        purpose: "A sensor breakout",
      },
    });
  });

  it("is not a project without its version, and an older brief still reads", () => {
    const legacy = JSON.stringify({ ...EMPTY_BRIEF, purpose: "Old bracket" });
    expect(parseStudioProject(legacy)).toBeNull();
    expect(parseStudioProject("not json")).toBeNull();
    expect(readProjectBrief(undefined, legacy)?.purpose).toBe("Old bracket");
    const current = studioProjectJson({
      name: "Bracket",
      template: null,
      brief: { ...EMPTY_BRIEF, purpose: "New bracket" },
    });
    expect(readProjectBrief(current, legacy)?.purpose).toBe("New bracket");
  });

  it("stays off the project page's files", () => {
    expect(
      groupProjectFiles(["studio.json", "parts/bracket.step"]).map(({ group }) => group),
    ).toEqual(["Models"]);
  });
});

describe("agentsWithLayout", () => {
  it("says the template's layout once, after what AGENTS.md already says", () => {
    const fresh = agentsWithLayout(null, board)!;
    expect(fresh).toContain("`electronics/`");
    expect(agentsWithLayout(fresh, board)).toBeNull();
    const appended = agentsWithLayout("# Team rules\n\nUse metric.\n", board)!;
    expect(appended.startsWith("# Team rules\n\nUse metric.\n\n")).toBe(true);
    expect(agentsWithLayout(null, blank)).toBeNull();
  });
});
