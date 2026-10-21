import { describe, expect, it } from "vite-plus/test";

import { projectContents } from "./projectContents";

describe("project contents", () => {
  it("lists what a project holds by section, each thing once, by the file that shows it", () => {
    const contents = projectContents([
      {
        root: "/p/roomba",
        paths: [
          "README.md",
          "parts/bumper.step",
          "parts/bumper.stl",
          "parts/chassis.step",
          "drawings/bumper_drawing.pdf",
          "electronics/main.kicad_pcb",
          "electronics/main.kicad_sch",
          "parts/bumper.fea.json",
          "parts/bumper.fea.glb",
          "cam/bumper.cam.json",
          "cam/bumper.cam.glb",
          "cam/bumper.nc",
          "docs/PRD.md",
          "brief/references/sketch.jpg",
          "photos/prototype.jpg",
          "reference/vendor/motor.step",
        ],
      },
    ]);
    expect(
      contents.map(({ section, items }) => [section, items.map((item) => item.label)]),
    ).toEqual([
      ["CAD", ["Bumper drawing", "Bumper", "Chassis"]],
      ["Electronics", ["Main board", "Main schematic"]],
      ["Analysis", ["Bumper FEA study"]],
      ["Manufacturing", ["Bumper CAM job", "Bumper G-code"]],
      ["Documents", ["PRD"]],
    ]);
    const analysis = contents.find((entry) => entry.section === "Analysis")!;
    expect(analysis.items[0]!.file.path).toBe("parts/bumper.fea.glb");
  });

  it("lists every section, empty ones too, while a folder is still being read", () => {
    expect(
      projectContents([{ root: "/p/new", paths: null }]).map(({ section, items }) => [
        section,
        items.length,
      ]),
    ).toEqual([
      ["CAD", 0],
      ["Electronics", 0],
      ["Analysis", 0],
      ["Manufacturing", 0],
      ["Documents", 0],
    ]);
  });
});
