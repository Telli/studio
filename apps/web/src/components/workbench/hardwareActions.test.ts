import { describe, expect, it } from "vite-plus/test";

import { hardwareActions } from "./hardwareActions";

const labels = (kind: string, skills: string[], process?: string) =>
  hardwareActions(kind, new Set(skills), process).map(({ group, actions, others }) => [
    group,
    actions.map((action) => action.label),
    others.map((action) => action.label),
  ]);

describe("hardware actions", () => {
  it("offers a part only the jobs the installed skills can do, every way to make it apart", () => {
    expect(labels("Part", ["dfm", "cad"])).toEqual([
      [
        "Check",
        ["Weight and center of mass"],
        ["CNC machining", "Sheet metal", "Injection molding"],
      ],
      ["Document", ["Test plan", "Write up the results"], []],
    ]);
  });

  it("puts the project's own way of making first, and the other ways apart", () => {
    expect(
      labels(
        "Part",
        ["dfm", "dfam-check", "fea", "gcode", "bambu-labs", "cam"],
        "3D printing (FDM)",
      ),
    ).toEqual([
      [
        "Check",
        ["3D printing", "Strength under load"],
        ["CNC machining", "Sheet metal", "Injection molding"],
      ],
      ["Make", ["Print on a Bambu printer", "Slice for FDM"], ["G-code for CNC"]],
      ["Document", ["Test plan", "Write up the results"], []],
    ]);
  });

  it("gives an assembly its fit, parts list and instructions", () => {
    expect(labels("Assembly", ["cad"], "3D printing (FDM)")).toEqual([
      ["Check", ["Fit and clearance", "Weight and center of mass"], []],
      [
        "Document",
        ["Parts list", "Assembly instructions", "Test plan", "Write up the results"],
        [],
      ],
    ]);
  });

  it("gives a board board jobs and a mesh no machining", () => {
    expect(labels("Board", ["pcb", "pcb-dfm", "dfm"])).toEqual([
      ["Check", ["Board for fabrication"], []],
      ["Make", ["Route the board"], []],
      ["Document", ["Write up the results"], []],
    ]);
    expect(labels("Mesh", ["dfm", "dfam-check", "cam"])).toEqual([
      ["Check", [], ["3D printing"]],
      ["Document", ["Write up the results"], []],
    ]);
  });

  it("names the part in the job it writes", () => {
    const [check] = hardwareActions("Part", new Set(["fea"]));
    expect(check?.actions[0]?.prompt("parts/bracket.step")).toMatch(/^Check parts\/bracket\.step /);
  });
});
