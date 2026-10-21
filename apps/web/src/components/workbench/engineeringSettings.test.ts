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
    expect(search("agent update")).toEqual(["Agent update checks"]);
  });

  it("leaves out rows that do nothing in Studio", () => {
    // Home, the switcher and Cmd+K order projects by use; the sidebar never says Done.
    expect(search("project order")).toEqual([]);
    expect(search("mark inactive")).toEqual([]);
  });

  it("words a row plainly only in the engineering interface", () => {
    expect(engineeringSettingCopy("provider-update-checks", true)?.title).toBe(
      "Agent update checks",
    );
    expect(engineeringSettingCopy("provider-update-checks", false)).toBeNull();
    expect(engineeringSettingCopy("time-format", true)).toBeNull();
  });
});
