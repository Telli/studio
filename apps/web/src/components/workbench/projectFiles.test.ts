import { describe, expect, it } from "vite-plus/test";

import { classifyProjectFile, groupProjectFiles } from "./projectFiles";

const demo = [
  "parts/STEP/l_bracket.step",
  "parts/STEP/mounting_plate.step",
  "parts/src/l_bracket.py",
  "parts/src/lib/part_common.py",
  "electronics/PCB/servo_power.kicad_pcb",
  "electronics/PCB/servo_power.kicad_sch",
  "electronics/PCB/servo_power.bom.csv",
  "electronics/PCB/servo_power.gerbers.zip",
  "out/l_bracket.cam.glb",
  "out/l_bracket.nc",
  "plans/bracket-review.md",
  "AGENTS.md",
  "brief/brief.json",
  "brief/project.md",
  "brief/references/sketch.jpg",
  ".venv/lib/readme.md",
  "node_modules/x/README.md",
];

describe("project files", () => {
  it("files a project the way an engineer would, leaving source and tooling out", () => {
    expect(
      groupProjectFiles(demo).map(({ group, files }) => [group, files.map((file) => file.name)]),
    ).toEqual([
      ["Models", ["l_bracket.step", "mounting_plate.step"]],
      ["Boards and wiring", ["servo_power.kicad_pcb", "servo_power.kicad_sch"]],
      ["Studies and jobs", ["l_bracket.cam.glb", "l_bracket.nc"]],
      ["Documents", ["bracket-review.md"]],
      ["Fabrication files", ["servo_power.bom.csv", "servo_power.gerbers.zip"]],
      ["References", ["project.md", "sketch.jpg"]],
    ]);
  });

  it("names what each file is", () => {
    expect(classifyProjectFile("electronics/PCB/servo_power.bom.csv")).toMatchObject({
      kind: "BOM",
      folder: "electronics/PCB",
    });
    expect(classifyProjectFile("out/l_bracket.nc")?.kind).toBe("G-code");
    expect(classifyProjectFile("parts/src/l_bracket.py")).toBeNull();
  });

  it("narrows by a search over paths", () => {
    expect(
      groupProjectFiles(demo, "servo").flatMap(({ files }) => files.map((f) => f.name)),
    ).toEqual([
      "servo_power.kicad_pcb",
      "servo_power.kicad_sch",
      "servo_power.bom.csv",
      "servo_power.gerbers.zip",
    ]);
  });
});
