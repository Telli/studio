import { describe, expect, it } from "vite-plus/test";

import { classifyProjectFile, filePlaces, groupProjectFiles } from "./projectFiles";

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
  "fea/results/charging-thermal.glb",
  "reference/raytac/MDBT50Q.step",
  "plans/bracket-review.md",
  "AGENTS.md",
  "assets/icon.svg",
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
      ["Mechanical", ["l_bracket.step", "mounting_plate.step"]],
      ["Electrical", ["servo_power.kicad_pcb", "servo_power.kicad_sch"]],
      ["Documents", ["bracket-review.md"]],
      ["Studies", ["charging-thermal.glb"]],
      [
        "Manufacturing",
        ["servo_power.bom.csv", "servo_power.gerbers.zip", "l_bracket.cam.glb", "l_bracket.nc"],
      ],
      ["Reference parts", ["MDBT50Q.step"]],
      ["References", ["project.md", "sketch.jpg"]],
    ]);
  });

  it("names what each file is and what it is called", () => {
    expect(classifyProjectFile("electronics/PCB/servo_power.bom.csv")).toMatchObject({
      title: "Servo power",
      kind: "Bill of materials",
      folder: "electronics/PCB",
    });
    expect(classifyProjectFile("parts/STEP/l_bracket.step")).toMatchObject({
      title: "L bracket",
      kind: "Part",
    });
    expect(classifyProjectFile("brief/references/sketch.jpg")).toMatchObject({
      title: "Sketch",
      kind: "Image",
    });
    expect(classifyProjectFile("out/l_bracket.nc")?.kind).toBe("G-code");
    expect(classifyProjectFile("parts/src/l_bracket.py")).toBeNull();
  });

  it("says where a file sits only to tell two alike apart", () => {
    const files = ["parts/v1/bracket.step", "parts/v2/bracket.step", "bracket.dxf", "plate.step"]
      .map(classifyProjectFile)
      .filter((file) => file !== null);
    expect(Object.fromEntries(filePlaces(files))).toEqual({
      "parts/v1/bracket.step": "V1",
      "parts/v2/bracket.step": "V2",
    });
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
