import { describe, expect, it } from "vite-plus/test";

import { changesPhrase, designChanges } from "./designChanges";

describe("design changes", () => {
  it("folds a part's files into the part, and keeps documents their own", () => {
    const { changes, other } = designChanges([
      "parts/src/servo_bracket.py",
      "parts/STEP/servo_bracket.step",
      "parts/STEP/servo_bracket.glb",
      "drawings/servo_bracket.dxf",
      "parts/servo_bracket.fea.json",
      "docs/fea-report.md",
      "parts/src/lib/part_common.py",
      "AGENTS.md",
      ".venv/lib/x.py",
    ]);
    expect(changes).toEqual([
      {
        name: "Servo bracket",
        label: "Servo bracket",
        aspects: ["model", "mesh", "drawing", "FEA study"],
        kind: "Part",
        open: "parts/STEP/servo_bracket.step",
      },
      {
        name: "FEA report",
        label: "FEA report",
        aspects: [],
        kind: "Document",
        open: "docs/fea-report.md",
      },
    ]);
    expect(other).toBe(3);
  });

  it("names a lone aspect with its part, and opens a study's numbers as its model", () => {
    const { changes } = designChanges(["drawings/bracket.dxf", "fea/plate.fea.json"]);
    expect(changes.map((change) => [change.label, change.open])).toEqual([
      ["Bracket drawing", "drawings/bracket.dxf"],
      ["Plate FEA study", "fea/plate.fea.glb"],
    ]);
  });

  it("has nothing to open for a model script on its own", () => {
    expect(designChanges(["parts/bracket.py"]).changes[0]).toMatchObject({
      label: "Bracket",
      open: null,
    });
  });

  it("says the changes in a sentence", () => {
    const { changes } = designChanges(["a.step", "b.dxf", "c.step"]);
    expect(changesPhrase(changes.slice(0, 1))).toBe("the A");
    expect(changesPhrase(changes.slice(0, 2))).toBe("the A and the B drawing");
    expect(changesPhrase(changes)).toBe("the A and 2 more");
    expect(changesPhrase(changes.slice(0, 1), 2)).toBe("the A and 2 more");
    expect(changesPhrase([])).toBeNull();
  });
});
