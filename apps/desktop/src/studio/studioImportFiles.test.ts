// @effect-diagnostics nodeBuiltinImport:off - the test builds folders with Node's own APIs.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { copyInto, defaultRoots, scanFolder } from "./studioImportFiles.ts";

let home: string;

beforeEach(async () => {
  home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "studio-import-"));
});

afterEach(async () => {
  await NodeFSP.rm(home, { recursive: true, force: true });
});

async function write(relative: string, text = "x") {
  const path = NodePath.join(home, relative);
  await NodeFSP.mkdir(NodePath.dirname(path), { recursive: true });
  await NodeFSP.writeFile(path, text);
  return path;
}

describe("scanFolder", () => {
  it("finds engineering files and their kinds, and leaves out the rest", async () => {
    await write("Kawarobo/Mini/gear.step");
    await write("Kawarobo/Mini/robot BOM.xlsx");
    await write("Kawarobo/photo.jpg");
    await write("Kawarobo/song.mp3");
    const scan = await scanFolder(home);
    const found = scan.files
      .map((file) => [NodePath.relative(home, file.path), file.kind])
      .toSorted();
    expect(found).toEqual([
      ["Kawarobo/Mini/gear.step", "model"],
      ["Kawarobo/Mini/robot BOM.xlsx", "partsList"],
      ["Kawarobo/photo.jpg", "photo"],
    ]);
    expect(scan.truncated).toBe(false);
  });

  it("skips hidden folders, caches and app bundles", async () => {
    await write(".git/objects/part.step");
    await write("node_modules/pkg/part.step");
    await write("Tool.app/Contents/part.step");
    await write("real/part.step");
    const scan = await scanFolder(home);
    expect(scan.files.map((file) => NodePath.relative(home, file.path))).toEqual([
      "real/part.step",
    ]);
  });

  it("stops at its limits and says so", async () => {
    await write("a.step");
    await write("b.step");
    await write("deep/1/2/c.step");
    const scan = await scanFolder(home, { files: 1, depth: 1 });
    expect(scan.files).toHaveLength(1);
    expect(scan.truncated).toBe(true);
    const shallow = await scanFolder(home, { files: 100, depth: 1 });
    expect(shallow.files.map((file) => NodePath.basename(file.path)).toSorted()).toEqual([
      "a.step",
      "b.step",
    ]);
  });

  it("treats a file on its own as its own scan", async () => {
    const part = await write("loose/arm v2.step");
    const scan = await scanFolder(part);
    expect(scan.files.map((file) => [file.path, file.kind])).toEqual([[part, "model"]]);
    expect((await scanFolder(await write("loose/song.mp3"))).files).toEqual([]);
  });
});

describe("defaultRoots", () => {
  it("offers Documents, Desktop and Downloads where they exist", async () => {
    await NodeFSP.mkdir(NodePath.join(home, "Documents"));
    await NodeFSP.mkdir(NodePath.join(home, "Downloads"));
    expect((await defaultRoots(home)).map((root) => root.label)).toEqual([
      "Documents",
      "Downloads",
    ]);
  });
});

describe("copyInto", () => {
  it("copies files and folders without writing over what is there", async () => {
    const part = await write("in/part.step", "new");
    await write("in/sub/drawing.dxf");
    await write("project/part.step", "old");
    const copied = await copyInto(
      [part, NodePath.join(home, "in/sub")],
      NodePath.join(home, "project"),
    );
    expect(copied.map((path) => NodePath.relative(home, path))).toEqual([
      "project/part (2).step",
      "project/sub",
    ]);
    expect(await NodeFSP.readFile(NodePath.join(home, "project/part.step"), "utf8")).toBe("old");
    expect(await NodeFSP.readFile(NodePath.join(home, "project/part (2).step"), "utf8")).toBe(
      "new",
    );
    await expect(
      NodeFSP.access(NodePath.join(home, "project/sub/drawing.dxf")),
    ).resolves.toBeUndefined();
  });
});
