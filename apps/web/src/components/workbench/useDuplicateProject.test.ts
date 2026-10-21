import { describe, expect, it } from "vite-plus/test";

import { copiedEntries, copyName } from "./useDuplicateProject";

describe("duplicating a project", () => {
  it("names the copy past the names taken", () => {
    expect(copyName("Bike wall hook", ["Lanyard clip"])).toBe("Bike wall hook copy");
    expect(copyName("Bike wall hook", ["bike wall hook copy", "Bike wall hook copy 2"])).toBe(
      "Bike wall hook copy 3",
    );
  });

  it("copies the folder's work, not its repository, caches or what the copy already has", () => {
    expect(
      copiedEntries(
        [
          "README.md",
          "parts/hook.py",
          "parts/hook.step",
          ".git/HEAD",
          ".studio/compare/a/older.step",
          "tmp/toolchain/x.tar.gz",
          "node_modules/x/index.js",
          "assets/icon.svg",
        ],
        ["assets/icon.svg"],
      ),
    ).toEqual(["README.md", "parts"]);
  });
});
