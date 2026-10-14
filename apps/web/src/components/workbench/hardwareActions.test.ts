import { describe, expect, it } from "vite-plus/test";

import { hardwareActions } from "./hardwareActions";

const labels = (kind: string, skills: string[]) =>
  hardwareActions(kind, new Set(skills)).map(({ group, actions }) => [
    group,
    actions.map((action) => action.label),
  ]);

describe("hardware actions", () => {
  it("offers a part only the jobs the installed skills can do", () => {
    expect(labels("Part", ["dfm", "cad"])).toEqual([
      ["Check", ["CNC machining", "Sheet metal", "Injection molding"]],
      ["Document", ["STL and 3MF", "Write up the results"]],
    ]);
  });

  it("gives a board board jobs and a mesh no machining", () => {
    expect(labels("Board", ["pcb", "pcb-dfm", "dfm"])).toEqual([
      ["Check", ["Board for fabrication"]],
      ["Make", ["Route the board"]],
      ["Document", ["Write up the results"]],
    ]);
    expect(labels("Mesh", ["dfm", "dfam-check", "cam"])).toEqual([
      ["Check", ["3D printing"]],
      ["Document", ["Write up the results"]],
    ]);
  });

  it("names the part in the job it writes", () => {
    const [check] = hardwareActions("Part", new Set(["fea"]));
    expect(check?.actions[0]?.prompt("parts/bracket.step")).toMatch(/^Check parts\/bracket\.step /);
  });
});
