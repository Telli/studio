import { describe, expect, it } from "vite-plus/test";

import { EMPTY_BRIEF } from "./briefFolder";
import { classifyProjectFile, type ProjectFile } from "./projectFiles";
import { projectStarters } from "./starterJobs";

const files = (...paths: string[]) =>
  paths.map(classifyProjectFile).filter((file): file is ProjectFile => file !== null);

describe("project starters", () => {
  it("suggests the jobs the project's recent parts take, checks first", () => {
    const starters = projectStarters(
      files("parts/STEP/l_bracket.step", "notes/todo.md"),
      new Set(["dfm", "cam", "cad"]),
      null,
    );
    expect(starters.map((starter) => starter.label)).toEqual([
      "Check L bracket for CNC machining",
      "Post G-code for L bracket",
    ]);
    expect(starters[0]?.prompt).toBe(
      "Check [l_bracket.step](parts/STEP/l_bracket.step) for CNC machining: tool access, internal corners, thin walls and setups. Tell me what to change.",
    );
  });

  it("offers only what the installed skills can do", () => {
    expect(
      projectStarters(files("parts/STEP/l_bracket.step"), new Set(["gcode"]), null).map(
        (starter) => starter.label,
      ),
    ).toEqual(["Slice L bracket for printing"]);
  });

  it("starts an empty project from its brief, and suggests nothing without one", () => {
    const brief = { ...EMPTY_BRIEF, purpose: "A wall bracket for a 5 kg shelf." };
    expect(projectStarters([], new Set(["cad"]), brief)).toEqual([
      {
        label: "Start the design from the brief",
        prompt:
          "Design the first part of this project from its brief: A wall bracket for a 5 kg shelf.",
      },
    ]);
    expect(projectStarters([], new Set(["cad"]), null)).toEqual([]);
  });

  it("names a model by its name, never its id", () => {
    const document = "6f1c0d8e-2b7a-4c1e-9d3f-5a6b7c8d9e0f";
    const starters = projectStarters(
      [
        {
          path: document,
          name: "horn_adapter.py",
          title: "Horn adapter",
          folder: "parts",
          group: "CAD",
          kind: "Part",
          document,
          script: "parts/horn_adapter.py",
        },
      ],
      new Set(["dfm", "cam"]),
      null,
    );
    expect(starters.length).toBeGreaterThan(0);
    for (const starter of starters) expect(starter.prompt).not.toContain(document);
    expect(starters[0]?.prompt).toContain("Horn adapter");
  });
});
