import { describe, expect, it } from "vite-plus/test";

import { overviewParts, resultsFor } from "./checkResults";
import { leadPartOf } from "./leadPart";
import { projectFileItems } from "./projectItems";
import { modelProjectFile, pictureVersions, readProjectModels } from "./projectModels";

const PLATE = "0b9c3c1e-5d0a-5f8e-9a43-2f1d6c7b8a90";
const RIG = "6f1d0a2b-3c4d-5e6f-8a9b-0c1d2e3f4a5b";
const BAR = "aa1d0a2b-3c4d-5e6f-8a9b-0c1d2e3f4a5b";

/** Recents as the engine lists it (`/__cad/recents`). */
const recents = {
  recents: [
    {
      path: PLATE,
      id: PLATE,
      kind: "model",
      name: "mounting_plate",
      script: "/p/bracket/parts/mounting_plate.py",
      updated: 1_761_555_600.25,
      missing: false,
    },
    // CAD mode's rollback bar's body: a shape handed over, no part of the project.
    {
      path: BAR,
      id: BAR,
      kind: "shape",
      name: "mounting_plate at the rollback bar 1a2b3c4d",
      script: "/p/bracket",
      updated: 1_761_555_700,
    },
    // A model of another project, and one whose script is gone.
    { path: RIG, id: RIG, kind: "model", name: "rig", script: "/p/other/rig.py", updated: 1 },
    {
      path: "c0ffee00-3c4d-5e6f-8a9b-0c1d2e3f4a5b",
      id: "c0ffee00-3c4d-5e6f-8a9b-0c1d2e3f4a5b",
      kind: "model",
      name: "gone",
      script: "/p/bracket/parts/gone.py",
      updated: 1,
      missing: true,
    },
    { path: "/p/bracket/parts/vendor.step", kind: "file", updated: 1 },
  ],
};

describe("a project's models", () => {
  it("are the models Recents lists whose script is in the folder, never a shape handed over", () => {
    expect(readProjectModels(recents, "/p/bracket/")).toEqual([
      {
        id: PLATE,
        name: "mounting_plate",
        script: "parts/mounting_plate.py",
        updated: "1761555600.25",
      },
    ]);
    expect(readProjectModels(null, "/p/bracket")).toEqual([]);
  });

  it("are listed as parts by their document id, named as the engine names them", () => {
    const [model] = readProjectModels(recents, "/p/bracket");
    const file = modelProjectFile(model!);
    expect(file).toEqual({
      path: PLATE,
      name: "mounting_plate.py",
      title: "Mounting plate",
      folder: "parts",
      group: "CAD",
      kind: "Part",
      document: PLATE,
      script: "parts/mounting_plate.py",
      version: "1761555600.25",
    });
    expect(pictureVersions([file])).toEqual({ [PLATE]: "1761555600.25" });
  });

  it("lead the project and its list, with a STEP exported beside one folded into it", () => {
    const models = readProjectModels(recents, "/p/bracket");
    const folder = {
      root: "/p/bracket",
      paths: ["parts/mounting_plate.py", "parts/mounting_plate.step", "README.md"],
      models,
    };
    expect(leadPartOf([folder])?.file.path).toBe(PLATE);
    expect(projectFileItems([folder]).map((item) => [item.file.path, item.label])).toEqual([
      [PLATE, "Mounting plate"],
    ]);
    const parts = overviewParts([
      modelProjectFile(models[0]!),
      {
        path: "parts/mounting_plate.step",
        name: "mounting_plate.step",
        title: "Mounting plate",
        folder: "parts",
        group: "CAD",
        kind: "Part",
      },
    ]);
    expect(parts.map((part) => part.path)).toEqual([PLATE]);
  });

  it("take the checks cadgen 0.8 names them by, their document id", () => {
    const part = modelProjectFile(readProjectModels(recents, "/p/bracket")[0]!);
    const result = (named: string) => ({
      path: `FEA/${named}.fea.json`,
      model: `FEA/${named}.fea.glb`,
      part: named,
      check: "Strength",
      status: "ready" as const,
      headline: "Holds",
      issues: [],
    });
    expect(
      resultsFor(part, [result(PLATE), result(RIG), result("mounting_plate")]).map((r) => r.part),
    ).toEqual([PLATE, "mounting_plate"]);
  });
});
