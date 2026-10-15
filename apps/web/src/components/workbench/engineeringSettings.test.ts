import { describe, expect, it } from "vite-plus/test";

import { SETTINGS_SEARCH_ITEMS, searchSettings } from "../settings/settingsSearch";
import { engineeringSettingCopy, engineeringSettingsSearchItems } from "./engineeringSettings";

/** Titles of the General page's results for `query` in the engineering interface. */
const search = (query: string) =>
  searchSettings(query, engineeringSettingsSearchItems(SETTINGS_SEARCH_ITEMS))
    .filter((item) => item.to === "/settings/general")
    .map((item) => item.title);

describe("engineering settings", () => {
  it("leaves worktrees, git, diffs, pull requests and usage limits out of General's results", () => {
    expect(search("worktree")).toEqual([]);
    expect(search("submodules")).toEqual([]);
    expect(search("pull request")).toEqual([]);
    expect(search("diff layout")).toEqual([]);
    expect(search("limited threads")).toEqual([]);
    expect(search("working section")).toEqual([]);
    expect(search("project grouping")).toEqual([]);
  });

  it("finds the rows it keeps by the names it shows", () => {
    expect(search("permissions")).toContain("Permissions");
    expect(search("mark inactive")).toEqual(["Mark inactive threads done"]);
    expect(search("agent update")).toEqual(["Agent update checks"]);
    expect(search("project order")).toEqual(["Project order"]);
  });

  it("words a row plainly only in the engineering interface", () => {
    expect(engineeringSettingCopy("provider-update-checks", true)?.title).toBe(
      "Agent update checks",
    );
    expect(engineeringSettingCopy("provider-update-checks", false)).toBeNull();
    expect(engineeringSettingCopy("time-format", true)).toBeNull();
  });
});
