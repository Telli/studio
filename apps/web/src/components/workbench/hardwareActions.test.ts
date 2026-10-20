import { describe, expect, it } from "vite-plus/test";

import { hardwareActions } from "./hardwareActions";

const menus = (kind: string, skills: string[], process?: string) =>
  hardwareActions(kind, new Set(skills), process).map((menu) => [
    menu.group,
    menu.sections.map((section) => [section.title, section.actions.map((action) => action.label)]),
    menu.others.map((section) => [section.title, section.actions.map((action) => action.label)]),
  ]);

describe("hardware actions", () => {
  it("offers a part only the jobs the installed skills can do, every way to make it apart", () => {
    expect(menus("Part", ["dfm", "cad"])).toEqual([
      ["Evaluate", [[null, ["Weight and center of mass"]]], []],
      [
        "Manufacture",
        [],
        [
          ["CNC machining", ["Check for CNC machining"]],
          ["Sheet metal and cutting", ["Check as sheet metal"]],
          ["Injection molding", ["Check for injection molding"]],
        ],
      ],
      ["Document", [[null, ["Test plan", "Write up the results"]]], []],
    ]);
  });

  it("puts the project's own way of making it first, whole, and the other ways apart", () => {
    expect(
      menus(
        "Part",
        ["dfm", "dfam-check", "fea", "gcode", "bambu-labs", "cam", "step-parts"],
        "3D printing (FDM)",
      ),
    ).toEqual([
      ["Evaluate", [[null, ["Strength under load"]]], []],
      [
        "Manufacture",
        [
          ["3D printing", ["Check for 3D printing", "Slice for FDM", "Print on a Bambu printer"]],
          ["Buy", ["Off-the-shelf parts"]],
        ],
        [
          ["CNC machining", ["Check for CNC machining", "G-code for CNC"]],
          ["Sheet metal and cutting", ["Check as sheet metal"]],
          ["Injection molding", ["Check for injection molding"]],
        ],
      ],
      ["Document", [[null, ["Test plan", "Write up the results"]]], []],
    ]);
  });

  it("gives an assembly its fit, parts list and instructions", () => {
    expect(menus("Assembly", ["cad"], "3D printing (FDM)")).toEqual([
      ["Evaluate", [[null, ["Fit and clearance", "Weight and center of mass"]]], []],
      [
        "Document",
        [[null, ["Parts list", "Assembly instructions", "Test plan", "Write up the results"]]],
        [],
      ],
    ]);
  });

  it("gives a board its own jobs and a mesh no machining", () => {
    expect(menus("Board", ["pcb", "pcb-dfm", "dfm"])).toEqual([
      ["Manufacture", [["Circuit board", ["Check for fabrication", "Route the board"]]], []],
      ["Document", [[null, ["Write up the results"]]], []],
    ]);
    expect(menus("Mesh", ["dfm", "dfam-check", "cam"])).toEqual([
      ["Manufacture", [], [["3D printing", ["Check for 3D printing"]]]],
      ["Document", [[null, ["Write up the results"]]], []],
    ]);
  });

  it("names the part in the job it writes", () => {
    const [evaluate] = hardwareActions("Part", new Set(["fea"]));
    expect(evaluate?.sections[0]?.actions[0]?.prompt("parts/bracket.step")).toMatch(
      /^Check parts\/bracket\.step /,
    );
  });
});
