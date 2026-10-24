import type { StudioProject } from "@t3tools/contracts";
import { EMPTY_STUDIO_BRIEF } from "@t3tools/shared/studioProjects";
import { describe, expect, it } from "vite-plus/test";

import { findSample, inTurn, SAMPLE_NAME, sampleMode } from "./sampleProject";

const project = (name: string, folder: string): StudioProject => ({
  name,
  template: "part",
  brief: EMPTY_STUDIO_BRIEF,
  folders: [folder],
  createdAt: "2026-10-24T00:00:00.000Z",
});

describe("sample project", () => {
  it("finds the sample by its name and marker", async () => {
    const projects = {
      mine: project(SAMPLE_NAME, "/w/my-bracket"),
      copied: project(SAMPLE_NAME, "/w/servo-bracket-sample"),
    };
    const found = await findSample(
      projects,
      async (folder) => folder === "/w/servo-bracket-sample",
    );
    expect(found).toEqual({ id: "copied", project: projects.copied });
  });

  it("ignores a project that only shares the name", async () => {
    const projects = { mine: project(SAMPLE_NAME, "/w/my-bracket") };
    expect(await findSample(projects, async () => false)).toBeNull();
  });

  it("never looks inside other projects", async () => {
    const looked: string[] = [];
    await findSample(
      {
        rover: project("Rover arm", "/w/rover"),
        sample: project(SAMPLE_NAME, "/w/servo-bracket-sample"),
        lamp: project("Desk lamp", "/w/lamp"),
      },
      async (folder) => {
        looked.push(folder);
        return false;
      },
    );
    expect(looked).toEqual(["/w/servo-bracket-sample"]);
  });

  it("falls back to today's prompt without a sample to copy", () => {
    expect(sampleMode({ sampleProject: null, canCopy: true })).toBe("prompt");
    expect(sampleMode({ sampleProject: "/s", canCopy: false })).toBe("prompt");
    expect(sampleMode({ sampleProject: "/s", canCopy: true })).toBe("copy");
  });

  it("makes a second open wait for the copy the first is making, not make another", async () => {
    const underWay = new Map<string, Promise<unknown>>();
    let copies = 0;
    let finishCopy = () => {};
    const copying = new Promise<void>((resolve) => {
      finishCopy = resolve;
    });
    // As `useSampleProject` opens: the sample made earlier, else a copy made now.
    const open = () =>
      inTurn(underWay, "local", async () => {
        if (copies > 0) return "found";
        await copying;
        copies += 1;
        return "made";
      });
    const first = open();
    const second = open();
    finishCopy();
    expect(await Promise.all([first, second])).toEqual(["made", "found"]);
    expect(copies).toBe(1);
  });
});
