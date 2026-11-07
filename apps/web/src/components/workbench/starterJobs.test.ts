import { describe, expect, it } from "vite-plus/test";

import { EMPTY_BRIEF } from "./briefFolder";
import { classifyProjectFile, type ProjectFile } from "./projectFiles";
import { projectStarters } from "./starterJobs";

const files = (...paths: string[]) =>
  paths.map(classifyProjectFile).filter((file): file is ProjectFile => file !== null);

describe("project starters", () => {
  it("suggests each kind of job the project's recent parts take once, checks first", () => {
    const starters = projectStarters(
      files("parts/STEP/l_bracket.step", "notes/todo.md"),
      new Set(["dfm", "cam", "cad"]),
      null,
    );
    expect(starters.map((starter) => starter.label)).toEqual([
      "Check L bracket for CNC machining",
      "Weight of L bracket",
      "3D PMI for L bracket",
      "Post G-code for L bracket",
    ]);
    expect(starters[0]?.prompt).toBe(
      "Tool: Check for CNC machining\n\nCheck [l_bracket.step](parts/STEP/l_bracket.step) for CNC machining: tool access, internal corners, thin walls and setups. Tell me what to change.",
    );
  });

  it("says what kind of work each starter is, by the menu its job sits in", () => {
    const starters = projectStarters(
      files("parts/STEP/l_bracket.step"),
      new Set(["dfm", "cam", "cad", "fea", "engineering-drawing"]),
      null,
    );
    expect(starters.map((starter) => starter.kind)).toEqual([
      "Manufacturing",
      "Analysis",
      "Documents",
      "Manufacturing",
    ]);
  });

  it("starts on the lead part, however recently another was touched", () => {
    const [touched, lead] = files("parts/nema17.step", "parts/motor_plate.step");
    const starters = projectStarters([touched!, lead!], new Set(["dfm"]), null, undefined, lead);
    expect(starters[0]?.prompt).toContain("motor_plate.step");
  });

  it("calls the lead part's jobs by their tiles' names, and any other part's by the part", () => {
    const [plate, mesh, other] = files(
      "parts/motor_plate.step",
      "parts/mount.stl",
      "parts/arm.step",
    );
    const label = (lead: ProjectFile) =>
      projectStarters([lead, other!], new Set(["dfm"]), null, undefined, lead)[0]?.label;
    expect(label(plate!)).toBe("Check for CNC machining");
    // A mesh can't be checked for machining, so the job falls to a part that is not the lead.
    expect(label(mesh!)).toBe("Check arm for CNC machining");
  });

  it("checks for the brief's way of making it first, and never offers to make a study's picture", () => {
    const brief = { ...EMPTY_BRIEF, process: "Sheet metal" };
    const recent = [
      "studies/tip-load.glb",
      "studies/tip-load.result.json",
      "studies/tip-load.json",
      "parts/bracket.step",
    ];
    const starters = projectStarters(
      files(...recent),
      new Set(["dfm", "dfam-check", "gcode", "cam", "cad"]),
      brief,
      new Set(recent),
    );
    expect(starters[0]?.label).toBe("Check bracket as sheet metal");
    expect(starters.some((starter) => /tip load/i.test(starter.label))).toBe(false);
  });

  it("never offers one job on every part", () => {
    const labels = projectStarters(
      files("parts/arm.step", "parts/base.step"),
      new Set(["dfam-check", "gcode", "fea", "engineering-drawing"]),
      null,
    ).map((starter) => starter.label);
    expect(labels.filter((label) => label.endsWith("for FDM printing"))).toHaveLength(1);
    expect(labels.filter((label) => label.startsWith("Slice "))).toHaveLength(1);
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
        kind: "CAD",
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
