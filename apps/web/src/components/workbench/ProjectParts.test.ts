import { describe, expect, it } from "vite-plus/test";

import { partsAmong } from "./ProjectParts";

describe("project parts", () => {
  it("keeps CAD files in search order, once each", () => {
    expect(
      partsAmong([
        "parts/bracket.step",
        "src/steps.ts",
        "boards/main.kicad_pcb",
        "parts/bracket.step",
        "cut/panel.dxf",
      ]),
    ).toEqual(["parts/bracket.step", "boards/main.kicad_pcb", "cut/panel.dxf"]);
  });

  it("drops a mesh exported beside its STEP but keeps a mesh of its own", () => {
    expect(
      partsAmong(["parts/bracket.step", "parts/bracket.stl", "parts/bracket.3mf", "scan/foot.stl"]),
    ).toEqual(["parts/bracket.step", "scan/foot.stl"]);
  });
});
