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
        ["Will it machine?", "Will it bend from sheet?", "Will it mold?"],
      ],
      ["Document", ["Test plan", "Write up what we did"], []],
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
        ["Will it print?", "Is it strong enough?"],
        ["Will it machine?", "Will it bend from sheet?", "Will it mold?"],
      ],
      ["Make", ["Print it on my Bambu", "Slice for my printer"], ["Toolpaths and G-code"]],
      ["Document", ["Test plan", "Write up what we did"], []],
    ]);
  });

  it("gives an assembly its fit, parts list and instructions", () => {
    expect(labels("Assembly", ["cad"], "3D printing (FDM)")).toEqual([
      ["Check", ["Do the parts fit?", "Weight and center of mass"], []],
      [
        "Document",
        ["Parts list", "Assembly instructions", "Test plan", "Write up what we did"],
        [],
      ],
    ]);
  });

  it("gives a board board jobs and a mesh no machining", () => {
    expect(labels("Board", ["pcb", "pcb-dfm", "dfm"])).toEqual([
      ["Check", ["Ready for the fab?"], []],
      ["Make", ["Route the board"], []],
      ["Document", ["Write up what we did"], []],
    ]);
    expect(labels("Mesh", ["dfm", "dfam-check", "cam"])).toEqual([
      ["Check", [], ["Will it print?"]],
      ["Document", ["Write up what we did"], []],
    ]);
  });

  it("names the part in the job it writes", () => {
    const [check] = hardwareActions("Part", new Set(["fea"]));
    expect(check?.actions[0]?.prompt("parts/bracket.step")).toMatch(/^Check parts\/bracket\.step /);
  });
});
