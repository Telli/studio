import { describe, expect, it } from "vite-plus/test";

import { partLabel } from "./partNames";
import { tabSuffixes } from "./tabSuffixes";

const MODEL = "11111111-2222-4333-8444-555555555555";
const OTHER_MODEL = "21111111-2222-4333-8444-555555555555";

describe("tabSuffixes", () => {
  it("leaves a tab with a title of its own alone", () => {
    const tabs = [
      { id: "a", title: "Motor mount", file: "motor_mount.step" },
      { id: "b", title: "Motor plate", file: "motor_plate.step" },
    ];
    expect(tabSuffixes(tabs).size).toBe(0);
  });

  it("tells two files of one name apart by kind first", () => {
    const tabs = [
      { id: "a", title: "Motor mount", file: "motor_mount.step" },
      { id: "b", title: "Motor mount", file: "motor_mount.md" },
    ];
    expect([...tabSuffixes(tabs)]).toEqual([
      ["a", "Part"],
      ["b", "Document"],
    ]);
  });

  it("tells a model from its export by format", () => {
    const tabs = [
      { id: "a", title: "Motor mount", file: MODEL },
      { id: "b", title: "Motor mount", file: "motor_mount.step" },
    ];
    expect([...tabSuffixes(tabs)]).toEqual([
      ["a", "Model"],
      ["b", "STEP"],
    ]);
  });

  it("tells two of the same kind and format apart by parent folder", () => {
    const tabs = [
      { id: "a", title: "Base", file: "parts/base.step" },
      { id: "b", title: "Base", file: "assemblies/base.step" },
      { id: "c", title: "Base", file: MODEL, script: "/p/fixtures/base.py" },
      { id: "d", title: "Base", file: OTHER_MODEL, script: "/p/jigs/base.py" },
    ];
    expect([...tabSuffixes(tabs)]).toEqual([
      ["a", "Parts"],
      ["b", "Assemblies"],
      ["c", "Fixtures"],
      ["d", "Jigs"],
    ]);
  });

  it("gives up on tabs with nothing to tell them by", () => {
    const tabs = [
      { id: "a", title: "Browser", file: null },
      { id: "b", title: "Browser", file: null },
    ];
    expect(tabSuffixes(tabs).size).toBe(0);
  });

  it("names a drawing's sheet as a drawing, so it never clashes with its part", () => {
    expect(partLabel("motor_mount_drawing.pdf")).toBe("Motor mount drawing");
    expect(partLabel("drawing.pdf")).toBe("Drawing");
  });
});
