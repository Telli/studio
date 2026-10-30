import { describe, expect, it } from "vite-plus/test";

import { markupName } from "./MarkUp";

describe("markup names", () => {
  it("names a markup for the file the tab shows, else for what the tab is", () => {
    expect(markupName("docs/strength-review.md", "file")).toBe("strength-review.md");
    expect(markupName(null, "preview")).toBe("preview");
  });
});
