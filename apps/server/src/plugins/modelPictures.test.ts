// @effect-diagnostics nodeBuiltinImport:off -- a stand-in renderer writes files the way cadgen snapshot does.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { renderModelPictures, snapshotLaunch } from "./modelPictures.ts";

const server = (args: string[]) => ({
  command: "uvx",
  args,
  env: { CADGEN_INSTALL_CHANNEL: "agent-plugins" },
  cwd: null,
  url: null,
  headers: {},
  startupTimeoutSec: null,
  toolTimeoutSec: null,
});

describe("model pictures", () => {
  it("renders with the plugin's own cadgen: its CAD server's launcher, snapshot for mcp", () => {
    const release = snapshotLaunch(
      { root: "/plugin", servers: { cad: server(["--from", "cadgen==0.7.21", "cadgen", "mcp"]) } },
      { PATH: "/usr/bin" },
    );
    expect(release?.args).toEqual(["--from", "cadgen==0.7.21", "cadgen", "snapshot"]);
    expect(release?.env).toMatchObject({
      PATH: "/usr/bin",
      CADGEN_INSTALL_CHANNEL: "agent-plugins",
    });
    const checkout = snapshotLaunch(
      {
        root: "/plugin",
        servers: {
          cad: { ...server(["-m", "cadgen.cli", "mcp"]), command: "/w/.venv/bin/python" },
        },
      },
      {},
    );
    expect(checkout?.args).toEqual(["-m", "cadgen.cli", "snapshot"]);
    expect(
      snapshotLaunch({ root: "/p", servers: { other: server(["some-server", "mcp"]) } }, {}),
    ).toBeNull();
  });

  it("renders what is missing in one batch, then answers from the cache", async () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pictures-"));
    const project = NodePath.join(dir, "project");
    NodeFS.mkdirSync(NodePath.join(project, "parts"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(project, "parts", "bracket.step"), "ISO-10303-21;");
    NodeFS.writeFileSync(NodePath.join(project, "parts", "broken.step"), "not a step");
    const runs = NodePath.join(dir, "runs.txt");
    // Stands in for `cadgen snapshot --job`: writes each job's picture, refuses broken files.
    const renderer = NodePath.join(dir, "renderer.mjs");
    NodeFS.writeFileSync(
      renderer,
      `import fs from "node:fs";
       const jobs = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf("--job") + 1], "utf8"));
       fs.appendFileSync(${JSON.stringify(runs)}, jobs.length + "\\n");
       if (jobs.some((job) => job.input.endsWith("broken.step"))) process.exit(2);
       for (const job of jobs) fs.writeFileSync(job.outputs[0].path, "PNG");`,
    );
    const input = {
      launch: { command: process.execPath, args: [renderer], env: {}, cwd: dir },
      cwd: project,
      paths: ["parts/bracket.step", "parts/broken.step", "parts/notes.md", "../outside.step"],
      cacheDir: NodePath.join(dir, "cache"),
    };
    const first = await renderModelPictures(input);
    expect(first).toEqual([
      { path: "parts/bracket.step", png: Buffer.from("PNG").toString("base64") },
      { path: "parts/broken.step", png: null },
      { path: "parts/notes.md", png: null },
      { path: "../outside.step", png: null },
    ]);
    // The batch failed on the broken file, so each was rendered alone.
    expect(NodeFS.readFileSync(runs, "utf8").trim().split("\n")).toEqual(["2", "1", "1"]);
    await renderModelPictures({ ...input, paths: ["parts/bracket.step"] });
    expect(NodeFS.readFileSync(runs, "utf8").trim().split("\n")).toHaveLength(3);
  });
});
