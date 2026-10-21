import { describe, expect, it } from "vite-plus/test";

import { hardwareActions } from "./hardwareActions";
import { findJobs, folderDocuments, folderParts, holdsWords } from "./quickFind";

const SKILLS = new Set(["fea", "cad", "dfm", "dfam-check", "cam", "gcode", "bambu-labs"]);
const labels = (query: string, process?: string) =>
  findJobs(hardwareActions("Part", SKILLS, process), query).map(
    (job) => `${job.place}: ${job.action.label}`,
  );

describe("quick find", () => {
  it("matches every word typed, in any order and case", () => {
    expect(holdsWords("Buckling\nStrength and durability\nEvaluate", "evaluate BUCK")).toBe(true);
    expect(holdsWords("Buckling\nStrength and durability\nEvaluate", "buckling heat")).toBe(false);
    expect(holdsWords("anything", "  ")).toBe(true);
  });

  it("finds a job the menus leave out, by its name", () => {
    expect(labels("buckling")).toEqual(["Evaluate · Strength and durability: Buckling"]);
  });

  it("finds a whole section, or a menu's every job, by their names", () => {
    expect(labels("evaluate heat")).toEqual([
      "Evaluate · Heat: How hot it gets",
      "Evaluate · Heat: Heat over time",
      "Evaluate · Heat: Heat stress",
      "Evaluate · Heat: Cooling by a flow",
    ]);
    const manufacture = labels("manufacture", "CNC machining");
    expect(manufacture[0]).toBe("Manufacture · CNC machining: Check for CNC machining");
    expect(manufacture).toContain("Manufacture · FDM printing: Slice for FDM");
  });

  it("finds no job until something is typed", () => {
    expect(labels("")).toEqual([]);
  });

  it("lists each folder's parts as the Overview does, a design's STEP inside it", () => {
    const parts = folderParts([
      {
        project: "Bike hook",
        root: "/work/hook",
        paths: ["hook.solidcraft", "hook.step", "notes.md", "clip.stl"],
      },
      { project: "Lanyard", root: "/work/lanyard", paths: null },
    ]);
    expect(parts.map((part) => [part.project, part.file.path, part.file.picture])).toEqual([
      ["Bike hook", "hook.solidcraft", "hook.step"],
      ["Bike hook", "clip.stl", undefined],
    ]);
  });

  it("finds each folder's documents, leaving the README to the Overview", () => {
    expect(
      folderDocuments([
        {
          project: "roomba",
          root: "/p/roomba",
          paths: ["README.md", "docs/prd.md", "parts/bumper.step", "docs/fmea.csv"],
        },
        { project: "clip", root: "/p/clip", paths: null },
      ]).map(({ project, file }) => [project, file.title]),
    ).toEqual([
      ["roomba", "PRD"],
      ["roomba", "FMEA"],
    ]);
  });
});
