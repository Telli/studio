import { describe, expect, it } from "vite-plus/test";

import { textToCadVersion } from "./textToCadVersion";

describe("textToCadVersion", () => {
  it("reads the version from the text-to-cad plugin, not from another", () => {
    expect(
      textToCadVersion([
        { id: "solidcraft", version: "1.2.0" },
        { id: "text-to-cad", version: "0.10.3" },
      ]),
    ).toBe("0.10.3");
  });

  it("names no version where the plugin is missing or says none", () => {
    expect(textToCadVersion([{ id: "solidcraft", version: "1.2.0" }])).toBeNull();
    expect(textToCadVersion([{ id: "text-to-cad", version: null }])).toBeNull();
  });
});
