// @effect-diagnostics nodeBuiltinImport:off - runs the Python tool on blockmaps of its own.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeZlib from "node:zlib";

import { assert, it } from "@effect/vitest";

const TOOL = NodePath.join(import.meta.dirname, "studio-update-size.py");

interface Block {
  readonly checksum: string;
  readonly size: number;
}

function blockmap(folder: string, name: string, blocks: ReadonlyArray<Block>, file = "file") {
  const path = NodePath.join(folder, name);
  const json = JSON.stringify({
    version: "2",
    files: [
      {
        name: file,
        offset: 0,
        checksums: blocks.map((block) => block.checksum),
        sizes: blocks.map((block) => block.size),
      },
    ],
  });
  NodeFS.writeFileSync(path, NodeZlib.gzipSync(json));
  return path;
}

function updateSize(blocksOf: (folder: string) => readonly [string, string]) {
  const folder = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "studio-update-size-"));
  try {
    const [oldPath, newPath] = blocksOf(folder);
    return NodeChildProcess.spawnSync("python3", ["-B", TOOL, oldPath, newPath], {
      encoding: "utf8",
    });
  } finally {
    NodeFS.rmSync(folder, { recursive: true, force: true });
  }
}

it("counts the blocks the old file lacks, by checksum and size, wherever they sit", () => {
  const done = updateSize((folder) => [
    blockmap(folder, "old", [
      { checksum: "a", size: 1_000_000 },
      { checksum: "b", size: 2_000_000 },
      { checksum: "c", size: 3_000_000 },
    ]),
    blockmap(folder, "new", [
      // Moved, so copied.
      { checksum: "c", size: 3_000_000 },
      // New, so downloaded.
      { checksum: "d", size: 4_000_000 },
      // The same checksum at another size is not the same block.
      { checksum: "b", size: 3_000_000 },
      { checksum: "a", size: 1_000_000 },
    ]),
  ]);
  assert.strictEqual(done.status, 0, done.stderr);
  assert.strictEqual(done.stdout.trim(), "7 of 11 MB (63.6%), 2 of 4 blocks");
});

it("refuses blockmaps of different files, which electron-updater downloads whole", () => {
  const done = updateSize((folder) => [
    blockmap(folder, "old", [{ checksum: "a", size: 10 }], "one"),
    blockmap(folder, "new", [{ checksum: "a", size: 10 }], "two"),
  ]);
  assert.notStrictEqual(done.status, 0);
  assert.include(done.stderr, "different files");
});
