import { describe, expect, it } from "vite-plus/test";

import { readmeSections } from "./projectReadme";

const README = `# Lanyard clip

## What it is

Holds a phone lanyard on a camera strap's ring. It slips onto the ring's 3 mm wire.

## Decisions

- The opening is 3.4 mm, so it slips on easily (2026-10-19, asked)
- The outside edges are rounded 1.2 mm (2026-10-19, by hand)
- Printed in PETG

## Notes

- Not a decision
`;

describe("readmeSections", () => {
  it("reads the title, What it is and the Decisions", () => {
    const sections = readmeSections(README);
    expect(sections.title).toBe("Lanyard clip");
    expect(sections.whatItIs).toBe(
      "Holds a phone lanyard on a camera strap's ring. It slips onto the ring's 3 mm wire.",
    );
    expect(sections.decisions).toEqual([
      { text: "The opening is 3.4 mm, so it slips on easily", when: "2026-10-19", how: "asked" },
      { text: "The outside edges are rounded 1.2 mm", when: "2026-10-19", how: "by hand" },
      { text: "Printed in PETG", when: null, how: null },
    ]);
  });

  it("reads a decision that ends with a full stop after its note", () => {
    const sections = readmeSections(
      "## Decisions\n\n- Fasten the hook to a wood stud (2026-10-19, asked).\n",
    );
    expect(sections.decisions).toEqual([
      { text: "Fasten the hook to a wood stud", when: "2026-10-19", how: "asked" },
    ]);
  });

  it("keeps a parenthesis that is not a date or a how", () => {
    const sections = readmeSections("## Decisions\n\n- Wall 2 mm (thicker than the lid)\n");
    expect(sections.decisions).toEqual([
      { text: "Wall 2 mm (thicker than the lid)", when: null, how: null },
    ]);
  });

  it("takes the opening paragraph when there is no What it is", () => {
    expect(readmeSections("# Gear guard\n\nKeeps fingers out of the gears.\n").whatItIs).toBe(
      "Keeps fingers out of the gears.",
    );
  });

  it("does not take the README a new project starts with as what it is", () => {
    const started = [
      '<img src="assets/icon.svg" width="64" height="64" alt="">',
      "",
      "# Wall hook",
      "",
      "Created in [T3 Code](https://t3.codes).",
      "",
    ].join("\n");
    expect(readmeSections(started)).toEqual({ title: "Wall hook", whatItIs: null, decisions: [] });
    expect(readmeSections(`${started}\nHolds a bike up by its front wheel.\n`).whatItIs).toBe(
      "Holds a bike up by its front wheel.",
    );
  });

  it("gives empty sections for a missing or empty README", () => {
    const empty = { title: null, whatItIs: null, decisions: [] };
    expect(readmeSections(null)).toEqual(empty);
    expect(readmeSections("  \n")).toEqual(empty);
  });
});
