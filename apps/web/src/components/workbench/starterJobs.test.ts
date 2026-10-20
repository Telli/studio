import { describe, expect, it } from "vite-plus/test";

import { EMPTY_BRIEF } from "./briefFolder";
import { classifyProjectFile, type ProjectFile } from "./projectFiles";
import { projectStarters } from "./starterJobs";

const files = (...paths: string[]) =>
  paths.map(classifyProjectFile).filter((file): file is ProjectFile => file !== null);

describe("project starters", () => {
  it("suggests the jobs the project's recent parts and boards take, checks first", () => {
    const starters = projectStarters(
      files("parts/STEP/l_bracket.step", "electronics/PCB/servo_power.kicad_pcb", "notes/todo.md"),
      new Set(["dfm", "cam", "pcb", "pcb-dfm", "cad"]),
      null,
    );
    expect(starters.map((starter) => starter.label)).toEqual([
      "Will L bracket machine?",
      "Is servo power ready for the fab?",
      "Toolpaths for L bracket",
      "Route servo power",
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
});
