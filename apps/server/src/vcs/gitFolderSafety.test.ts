import { describe, expect, it } from "vite-plus/test";

import { blankedFiltersEnv } from "./gitFolderSafety.ts";

const listing = (...entries: ReadonlyArray<readonly [string, string]>) =>
  entries.map(([scope, key]) => `${scope}\0${key}\0`).join("");

describe("blankedFiltersEnv", () => {
  it("blanks each filter a folder's config names, once", () => {
    const env = blankedFiltersEnv(
      listing(["local", "filter.supplier.clean"], ["local", "filter.supplier.smudge"]),
    );
    expect(env).toMatchObject({
      GIT_CONFIG_COUNT: "4",
      GIT_CONFIG_KEY_0: "filter.supplier.clean",
      GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_3: "filter.supplier.required",
      GIT_CONFIG_VALUE_3: "false",
    });
  });

  it("keeps a name with dots or an equals sign whole", () => {
    const env = blankedFiltersEnv(listing(["worktree", "filter.a=b.c.process"]));
    expect(env.GIT_CONFIG_KEY_0).toBe("filter.a=b.c.clean");
  });

  it("leaves a person's own filters, and nothing listed at all", () => {
    expect(blankedFiltersEnv(listing(["global", "filter.lfs.clean"]))).toEqual({});
    expect(blankedFiltersEnv(listing(["system", "filter.lfs.smudge"]))).toEqual({});
    expect(blankedFiltersEnv("")).toEqual({});
  });
});
