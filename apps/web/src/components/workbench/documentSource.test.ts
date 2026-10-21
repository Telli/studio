import { describe, expect, it } from "vite-plus/test";

import { readPlace, withWords } from "./documentSource";

const doc = "# Product xRD\n\n| # | Feature |\n| :-- | :-- |\n| PF01 | Clips on |\n\nA line.\n";

describe("document source", () => {
  it("reads a piece's place", () => {
    expect(readPlace("14:20")).toEqual({ start: 14, end: 20 });
    expect(readPlace("nope")).toBeNull();
    expect(readPlace(null)).toBeNull();
  });

  it("puts a cell's new words back in its place, the table intact", () => {
    const start = doc.indexOf("Clips on");
    const next = withWords(
      doc,
      { start, end: start + "Clips on".length },
      "tableCell",
      "Clips | snaps",
    );
    expect(next).toBe(doc.replace("Clips on", "Clips \\| snaps"));
  });

  it("keeps a heading on one line, and a paragraph's new paragraph", () => {
    const start = doc.indexOf("Product xRD");
    expect(withWords(doc, { start, end: start + 11 }, "heading", "Daisy\nclip xRD")).toBe(
      doc.replace("Product xRD", "Daisy clip xRD"),
    );
    const at = doc.indexOf("A line.");
    expect(withWords(doc, { start: at, end: at + 7 }, "paragraph", "One.\n\n\n\nTwo.")).toBe(
      doc.replace("A line.", "One.\n\nTwo."),
    );
  });
});
