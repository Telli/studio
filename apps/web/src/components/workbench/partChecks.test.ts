import { describe, expect, it } from "vite-plus/test";

import { parseCheckResult } from "./checkResults";
import { shownChecks } from "./partChecks";
import type { FolderChecks } from "./useProjectChecks";

const study = parseCheckResult(
  "FEA/bracket.bracket-load.json",
  JSON.stringify({
    generator: "cadgen fea",
    document: "bracket.step",
    summary: { safety_factor: 1.04, checks: [{ label: "Strength" }] },
    files: { glb: "bracket.bracket-load.glb" },
    findings: [{ severity: "warning", summary: "It holds, but only 1.0x the load" }],
  }),
)!;

const folders: ReadonlyArray<FolderChecks> = [
  {
    root: "/work/bracket",
    paths: [
      "parts/bracket.step",
      "parts/bracket.py",
      "FEA/bracket.bracket-load.glb",
      "FEA/bracket.bracket-load.json",
    ],
    results: [study],
  },
];

describe("the checks of the file on screen", () => {
  it("lists a part's checks, wherever its results are filed", () => {
    const { results, of } = shownChecks(folders, "/work/bracket/parts/bracket.step");
    expect(results.map(({ result }) => [result.check, result.status])).toEqual([
      ["Strength", "warnings"],
    ]);
    expect(of).toBeNull();
  });

  it("leads from a check's result back to the part it checked", () => {
    const { results, of } = shownChecks(folders, "/work/bracket/FEA/bracket.bracket-load.glb");
    expect(results).toEqual([]);
    expect(of).toBe("/work/bracket/parts/bracket.step");
  });

  it("has nothing to say about a file no check is about", () => {
    expect(shownChecks(folders, "/work/bracket/parts/lid.step")).toEqual({ results: [], of: null });
  });

  describe("a cadgen 0.8 model, shown by its document id", () => {
    const id = "6f1c0d8e-2b7a-4c1e-9d3f-5a6b7c8d9e0f";
    const byId = parseCheckResult(
      "FEA/plate.fea.json",
      JSON.stringify({
        generator: "cadgen fea",
        document: id,
        summary: { safety_factor: 6.3, checks: [{ label: "Strength" }] },
        files: { glb: "plate.fea.glb" },
        findings: [],
      }),
    )!;
    const modelFolders: ReadonlyArray<FolderChecks> = [
      {
        root: "/work/plate",
        paths: ["parts/plate.py", "FEA/plate.fea.glb", "FEA/plate.fea.json"],
        results: [byId, study],
      },
    ];

    it("lists the checks whose results name its id", () => {
      const { results, of } = shownChecks(modelFolders, id);
      expect(results.map(({ result }) => result.path)).toEqual(["FEA/plate.fea.json"]);
      expect(of).toBeNull();
    });

    it("leads from a check's result back to the model, by its id", () => {
      expect(shownChecks(modelFolders, "/work/plate/FEA/plate.fea.glb").of).toBe(id);
    });
  });
});
