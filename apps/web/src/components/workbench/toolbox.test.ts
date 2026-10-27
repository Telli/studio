import { describe, expect, it } from "vite-plus/test";

import { hardwareActions } from "./hardwareActions";
import { pictureOf } from "./library/libraryPictures";
import { GROUP_PICTURES, jobCount, toolboxFolded, toolboxGroups, toolboxView } from "./toolbox";

const menus = () =>
  hardwareActions("Part", new Set(["fea", "dfm", "dfam-check", "cam"]), "CNC machining");

describe("toolboxGroups", () => {
  it("always gives the three groups in order, empty when nothing applies", () => {
    const groups = toolboxGroups([]);
    expect(groups.map((group) => group.group)).toEqual(["Evaluate", "Manufacture", "Document"]);
    expect(groups.every((group) => group.sections.length === 0)).toBe(true);
  });

  it("shows the everyday sections open and the rest folded", () => {
    const [evaluate, manufacture] = toolboxGroups(menus());
    expect(evaluate?.sections[0]).toMatchObject({ title: "Simulation", folded: false });
    expect(evaluate?.sections.find((section) => section.title === "Heat")?.folded).toBe(true);
    expect(manufacture?.sections[0]?.title).toBe("CNC machining");
  });

  it("lists every job exactly once", () => {
    const fromMenus = menus().flatMap((menu) =>
      [...menu.sections, ...menu.others].flatMap((section) => section.actions.map((a) => a.id)),
    );
    const fromGroups = toolboxGroups(menus()).flatMap((group) =>
      group.sections.flatMap((section) => section.actions.map((a) => a.id)),
    );
    expect(fromGroups.toSorted()).toEqual(fromMenus.toSorted());
    expect(new Set(fromGroups).size).toBe(fromGroups.length);
  });
});

describe("GROUP_PICTURES", () => {
  it("names a Library picture for each group", () => {
    expect(GROUP_PICTURES.Evaluate).toBe("doc:simulation");
    expect(GROUP_PICTURES.Manufacture).toBe("doc:cam-job");
    expect(GROUP_PICTURES.Document).toBe("doc:drawing");
    for (const entry of Object.values(GROUP_PICTURES)) expect(pictureOf(entry)).not.toBeNull();
  });
});

describe("toolboxView", () => {
  it("opens a group, and goes back to the groups", () => {
    const open = toolboxView({ open: null }, { type: "open", group: "Manufacture" });
    expect(open).toEqual({ open: "Manufacture" });
    expect(toolboxView(open, { type: "back" })).toEqual({ open: null });
  });

  it("goes back to the groups when another part comes in front", () => {
    expect(toolboxView({ open: "Evaluate" }, { type: "part-changed" })).toEqual({ open: null });
  });
});

describe("toolboxFolded", () => {
  it("keeps the choice made on this device on a wide panel", () => {
    expect(toolboxFolded({ chosen: false, narrow: false, openedNarrow: false })).toBe(false);
    expect(toolboxFolded({ chosen: true, narrow: false, openedNarrow: true })).toBe(true);
  });

  it("folds on a narrow panel until it is opened there", () => {
    expect(toolboxFolded({ chosen: false, narrow: true, openedNarrow: false })).toBe(true);
    expect(toolboxFolded({ chosen: true, narrow: true, openedNarrow: true })).toBe(false);
  });
});

describe("jobCount", () => {
  it("counts a group's jobs, folded sections too", () => {
    const [evaluate] = toolboxGroups(menus());
    const all = evaluate?.sections.flatMap((section) => section.actions) ?? [];
    expect(evaluate && jobCount(evaluate)).toBe(all.length);
    expect(all.length).toBeGreaterThan(0);
    expect(toolboxGroups([]).map(jobCount)).toEqual([0, 0, 0]);
  });
});
