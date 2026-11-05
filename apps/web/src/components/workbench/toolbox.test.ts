import { describe, expect, it } from "vite-plus/test";

import { hardwareActions } from "./hardwareActions";
import { jobCount, toolboxFolded, toolboxGroups, toolboxLibraryLink } from "./toolbox";

const menus = () =>
  hardwareActions("Part", new Set(["fea", "dfm", "dfam-check", "cam"]), "CNC machining");

describe("toolboxGroups", () => {
  it("always gives the three groups in order, empty when nothing applies", () => {
    const groups = toolboxGroups([]);
    expect(groups.map((group) => group.group)).toEqual(["Evaluate", "Manufacture", "Document"]);
    expect(groups.every((group) => group.sections.length === 0)).toBe(true);
  });

  it("lists the everyday sections first and the menus' others after, nothing folded", () => {
    const [evaluate, manufacture] = toolboxGroups(menus());
    expect(evaluate?.sections[0]?.title).toBe("Simulation");
    expect(manufacture?.sections[0]?.title).toBe("Machining and molding");
    expect(manufacture?.sections.map((section) => section.title)).toContain("3D printing");
    expect(Object.keys(manufacture?.sections[0] ?? {}).toSorted()).toEqual(["actions", "title"]);
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
  it("counts a group's jobs in all its sections", () => {
    const [evaluate] = toolboxGroups(menus());
    const all = evaluate?.sections.flatMap((section) => section.actions) ?? [];
    expect(evaluate && jobCount(evaluate)).toBe(all.length);
    expect(all.length).toBeGreaterThan(0);
    expect(toolboxGroups([]).map(jobCount)).toEqual([0, 0, 0]);
  });
});

describe("toolboxLibraryLink", () => {
  it("opens the Library on the group, coming back here while the workspace can take a request", () => {
    expect(
      toolboxLibraryLink("Evaluate", { workspaceOpen: true, from: "/chat/t1" }).search,
    ).toEqual({
      group: "Evaluate",
      from: "/chat/t1",
    });
  });

  it("leaves out where to come back to when no workspace is open", () => {
    expect(toolboxLibraryLink("Document", { workspaceOpen: false, from: "/chat/t1" })).toEqual({
      to: "/library",
      search: { group: "Document" },
    });
  });
});
