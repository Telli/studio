// @effect-diagnostics nodeBuiltinImport:off - reads the sample project's README from disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { StudioProject } from "@t3tools/contracts";
import { EMPTY_STUDIO_BRIEF } from "@t3tools/shared/studioProjects";
import { describe, expect, it } from "vite-plus/test";

import {
  copySample,
  findSample,
  inTurn,
  SAMPLE_MARKER,
  SAMPLE_NAME,
  SAMPLE_PURPOSE,
  sampleMode,
} from "./sampleProject";

const ROOT = NodePath.join(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const SAMPLE = NodePath.join(ROOT, "studio-sample", "servo-bracket");

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

  it("copies the sample's README before its marker, and the marker last", async () => {
    const done: string[] = [];
    await copySample({
      entries: ["docs", SAMPLE_MARKER, "parts"],
      copy: async (entries) => {
        done.push(`copy ${entries.join(", ")}`);
      },
      writeReadme: async () => {
        done.push("write README.md");
      },
    });
    expect(done).toEqual(["copy docs, parts", "write README.md", `copy ${SAMPLE_MARKER}`]);
  });

  it("stops at a step that fails, so a copy cut short is never taken for the sample", async () => {
    const done: string[] = [];
    const copying = copySample({
      entries: ["docs", SAMPLE_MARKER],
      copy: async (entries) => {
        done.push(`copy ${entries.join(", ")}`);
      },
      writeReadme: async () => {
        throw new Error("Its README could not be written.");
      },
    });
    // It fails as a whole, so the project is not reported made.
    await expect(copying).rejects.toThrow("Its README could not be written.");
    expect(done).toEqual(["copy docs"]);
  });

  it("describes the copy as its README does, not as work to do", () => {
    // The Purpose goes into every chat in the copy, so it says what the finished project is.
    const readme = NodeFS.readFileSync(NodePath.join(SAMPLE, "README.md"), "utf8");
    const whatItIs = readme.split("\n## What it is\n\n")[1] ?? "";
    expect(whatItIs.slice(0, SAMPLE_PURPOSE.length)).toBe(SAMPLE_PURPOSE);
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
