import { describe, expect, it } from "vite-plus/test";

import { tabOrder, tabTarget } from "./panelTabShortcuts";

const ids = tabOrder([
  { id: "plugin:bumper", kind: "plugin-app" },
  { id: "files", kind: "files" },
  { id: "file:prd", kind: "file" },
]);

describe("panel tab shortcuts", () => {
  it("orders the tabs as they show, the pinned Overview first", () => {
    expect(ids).toEqual(["files", "plugin:bumper", "file:prd"]);
  });

  it("goes round the tabs with Ctrl+Tab and back with Ctrl+Shift+Tab", () => {
    expect(tabTarget(ids, "plugin:bumper", { step: 1 })).toBe("file:prd");
    expect(tabTarget(ids, "file:prd", { step: 1 })).toBe("files");
    expect(tabTarget(ids, "files", { step: -1 })).toBe("file:prd");
    expect(tabTarget(ids, null, { step: 1 })).toBe("files");
  });

  it("goes to a tab by its place, and Cmd+9 to the last, as Chrome does", () => {
    expect(tabTarget(ids, null, { digit: 1 })).toBe("files");
    expect(tabTarget(ids, null, { digit: 2 })).toBe("plugin:bumper");
    expect(tabTarget(ids, null, { digit: 5 })).toBeNull();
    expect(tabTarget(ids, null, { digit: 9 })).toBe("file:prd");
    expect(tabTarget([], null, { digit: 9 })).toBeNull();
  });
});
