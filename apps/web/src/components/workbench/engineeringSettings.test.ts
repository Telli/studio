import { describe, expect, it } from "vite-plus/test";

import { SETTINGS_SEARCH_ITEMS, searchSettings } from "../settings/settingsSearch";
import {
  CODE_SETTINGS_ROWS,
  engineeringSettingCopy,
  engineeringSettingsSearchItems,
  settingsNavGroups,
} from "./engineeringSettings";
import { settingsSearchSectionLabel } from "./studioInterface";

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
  });

  it("leaves out rows that do nothing in Studio", () => {
    // Home, the switcher and Cmd+K order projects by use; the sidebar never says Done.
    expect(search("project order")).toEqual([]);
    expect(search("mark inactive")).toEqual([]);
  });

  it("words a row plainly only in the engineering interface", () => {
    expect(engineeringSettingCopy("text-generation-model", true)?.title).toBe(
      "Model for short text",
    );
    expect(engineeringSettingCopy("text-generation-model", false)).toBeNull();
    expect(engineeringSettingCopy("time-format", true)).toBeNull();
  });

  it("leaves the programmer settings out of the engineering search and keeps them in the code one", () => {
    const hidden = [
      ["code font", "code-font"],
      ["terminal font", "terminal-font"],
      ["update checks", "provider-update-checks"],
      ["streaming", "response-streaming"],
      ["rich text", "composer-rich-text"],
      ["send shortcut", "send-shortcut"],
      ["follow-up", "follow-up-behavior"],
      ["glass opacity", "setting-glass-opacity"],
      ["contrast", "setting-appearance-contrast"],
    ] as const;
    const everything = (query: string) => searchSettings(query, SETTINGS_SEARCH_ITEMS);
    const engineering = (query: string) =>
      searchSettings(query, engineeringSettingsSearchItems(SETTINGS_SEARCH_ITEMS));
    for (const [query, id] of hidden) {
      expect(CODE_SETTINGS_ROWS.has(id)).toBe(true);
      expect(everything(query).map((item) => item.id)).toContain(id);
      expect(engineering(query).map((item) => item.id)).not.toContain(id);
    }
  });

  it("finds Diagnostics under Advanced, not on General", () => {
    const [result] = searchSettings(
      "diagnostics",
      engineeringSettingsSearchItems(SETTINGS_SEARCH_ITEMS),
    );
    expect(result?.to).toBe("/settings/diagnostics");
    expect(result?.targetId).toBe("diagnostics-processes");
    expect(settingsSearchSectionLabel(result!.to, "Diagnostics", true)).toBe("Advanced");
    expect(settingsSearchSectionLabel("/settings/diagnostics", "Diagnostics", false)).toBe(
      "Diagnostics",
    );
  });
});

describe("the model for new chats", () => {
  it("is found under AI agents in the engineering interface, and under General elsewhere", () => {
    const [here] = searchSettings(
      "new thread provider",
      engineeringSettingsSearchItems(SETTINGS_SEARCH_ITEMS),
    );
    expect(here?.id).toBe("default-model");
    expect(here?.to).toBe("/settings/providers");
    const [there] = searchSettings("new thread provider", SETTINGS_SEARCH_ITEMS);
    expect(there?.to).toBe("/settings/general");
  });
});

describe("settings sidebar groups", () => {
  const entries = [
    "/settings/general",
    "/settings/appearance",
    "/settings/keybindings",
    "/settings/providers",
    "/settings/plugins",
    "/settings/diagnostics",
    "/settings/interface",
  ].map((to) => ({ to }));
  const paths = (list: ReadonlyArray<{ to: string }>) => list.map((entry) => entry.to);

  it("puts Plugins, Diagnostics and Interface together under Advanced in the engineering interface", () => {
    const { main, advanced } = settingsNavGroups(entries, true);
    expect(paths(advanced)).toEqual([
      "/settings/plugins",
      "/settings/diagnostics",
      "/settings/interface",
    ]);
    expect(paths(main)).toEqual([
      "/settings/general",
      "/settings/appearance",
      "/settings/providers",
    ]);
  });

  it("keeps the code interfaces' sections as they were, the Interface switch in Appearance", () => {
    const { main, advanced } = settingsNavGroups(entries, false);
    expect(advanced).toEqual([]);
    expect(paths(main)).toEqual([
      "/settings/general",
      "/settings/appearance",
      "/settings/keybindings",
      "/settings/providers",
      "/settings/plugins",
    ]);
  });
});
