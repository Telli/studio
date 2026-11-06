// @effect-diagnostics nodeBuiltinImport:off - reads the sample project's README from disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { copyName } from "../examples/examples";
import { copySample, inTurn, copyThenOpen, SAMPLE_ID, SAMPLE_MARKER } from "./sampleProject";

const ROOT = NodePath.join(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const SAMPLE = NodePath.join(ROOT, "studio-sample", SAMPLE_ID);

describe("copying an example", () => {
  it("copies its files, then its README, and never its marker", async () => {
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
    expect(done).toEqual(["copy docs, parts", "write README.md"]);
  });

  it("stops at a step that fails, so the copy is not reported made", async () => {
    const done: string[] = [];
    const copying = copySample({
      entries: ["docs"],
      copy: async () => {
        throw new Error("Its files could not be copied.");
      },
      writeReadme: async () => {
        done.push("write README.md");
      },
    });
    await expect(copying).rejects.toThrow("Its files could not be copied.");
    expect(done).toEqual([]);
  });

  it("describes the copy as its README does, not as work to do", () => {
    // The Purpose goes into every chat in the copy, so it says what the finished project is.
    const readme = NodeFS.readFileSync(NodePath.join(SAMPLE, "README.md"), "utf8");
    const marker = JSON.parse(NodeFS.readFileSync(NodePath.join(SAMPLE, SAMPLE_MARKER), "utf8"));
    const whatItIs = readme.split("\n## What it is\n\n")[1] ?? "";
    expect(marker.purpose).toBeTruthy();
    expect(whatItIs.slice(0, marker.purpose.length)).toBe(marker.purpose);
  });

  it("names a second copy made at once past the first, never over it", async () => {
    const underWay = new Map<string, Promise<unknown>>();
    const projects: string[] = [];
    let finishFirst = () => {};
    const copying = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    // As `useExample` copies: read the projects, name the copy past them, make it.
    const copy = (wait: Promise<void>) =>
      inTurn(underWay, "local", async () => {
        const name = copyName("Phone stand", projects);
        await wait;
        projects.push(name);
        return name;
      });
    const first = copy(copying);
    const second = copy(Promise.resolve());
    finishFirst();
    expect(await Promise.all([first, second])).toEqual(["Phone stand", "Phone stand 2"]);
  });

  it("opens a copy on its Overview at once, then swaps to the model's document when its build lands", async () => {
    const done: string[] = [];
    const steps = (file: string, built: { id: string } | { error: string }) => ({
      file,
      name: "Motor mount plate",
      create: async (input: {
        onFolder: (folder: string) => Promise<void>;
        show: (ref: string) => void;
      }) => {
        await input.onFolder("/projects/motor/");
        done.push("project made");
        input.show("chat");
        return true;
      },
      copyInto: async (folder: string) => void done.push(`copy into ${folder}`),
      openFile: (ref: string, path: string) => void done.push(`${ref}: file ${path}`),
      openProject: (ref: string) => void done.push(`${ref}: overview`),
      build: async (ref: string, script: string) => {
        done.push(`${ref}: build ${script}`);
        return built;
      },
      openPart: (ref: string, id: string) => void done.push(`${ref}: document ${id}`),
      building: () => void done.push("building"),
      redateChecks: async (folder: string) => void done.push(`redate checks in ${folder}`),
      failed: (title: string, error: unknown, retry?: () => void) =>
        void done.push(
          `failed: ${title}: ${(error as Error).message}${retry ? " (Build again)" : ""}`,
        ),
    });
    expect(await copyThenOpen(steps("assemblies/motor_mount.py", { id: "doc-1" }))).toBe(true);
    expect(done).toEqual([
      "copy into /projects/motor/",
      "project made",
      "chat: overview",
      "building",
      "chat: build /projects/motor/assemblies/motor_mount.py",
      "chat: document doc-1",
      "redate checks in /projects/motor/",
    ]);
    // A model that does not build stays on the Overview, and says why, with Build again.
    done.length = 0;
    expect(await copyThenOpen(steps("parts/plate.py", { error: "NameError: WIDTH" }))).toBe(true);
    expect(done.slice(2)).toEqual([
      "chat: overview",
      "building",
      "chat: build /projects/motor/parts/plate.py",
      "failed: Made Motor mount plate, but its part did not build: NameError: WIDTH (Build again)",
    ]);
    // Any other file opens as it is, with nothing built.
    done.length = 0;
    expect(await copyThenOpen(steps("drawings/plate.pdf", { id: "unused" }))).toBe(true);
    expect(done).toEqual([
      "copy into /projects/motor/",
      "project made",
      "chat: file drawings/plate.pdf",
    ]);
  });
});
