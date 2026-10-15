import { describe, expect, it } from "vite-plus/test";

import { EMPTY_BRIEF, briefSummary } from "./briefFolder";

describe("brief summary", () => {
  it("says nothing while nothing is decided", () => {
    expect(briefSummary(EMPTY_BRIEF)).toEqual([]);
    expect(briefSummary({ ...EMPTY_BRIEF, units: "in" })).toEqual([]);
  });

  it("lists only what is decided, then the units", () => {
    expect(
      briefSummary({
        ...EMPTY_BRIEF,
        purpose: "A hair clip that holds a small camera\nworn at a concert",
        material: "PETG",
        quantity: "20",
        units: "in",
      }).map((entry) => entry.value),
    ).toEqual(["A hair clip that holds a small camera", "PETG", "Quantity 20", "Inches"]);
  });
});
