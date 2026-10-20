import { describe, expect, it } from "vite-plus/test";

import { readmeInline, readmeSections } from "./projectReadme";

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

  it("reads a decision written date first, with where it came from", () => {
    const sections = readmeSections(
      "## Decisions\n\n- 2026-10-19 — Support the bike by its front wheel. Source: user brief.\n- 2026-10-20: Thicker arm. Source: hand edit.\n",
    );
    expect(sections.decisions).toEqual([
      { text: "Support the bike by its front wheel", when: "2026-10-19", how: "asked" },
      { text: "Thicker arm", when: "2026-10-20", how: "by hand" },
    ]);
  });

  it("keeps every other section, in order, as written", () => {
    const sections = readmeSections(
      "# Bike wall hook\n\nHolds a bike.\n\n## Open questions\n\nWall construction; bike weight.\n\n## Notes\n\n- Print it on its side\n- Use four screws\n",
    );
    expect(sections.whatItIs).toBe("Holds a bike.");
    expect(sections.more).toEqual([
      { heading: "Open questions", paragraphs: ["Wall construction; bike weight."], items: [] },
      { heading: "Notes", paragraphs: [], items: ["Print it on its side", "Use four screws"] },
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
    expect(readmeSections(started)).toEqual({
      title: "Wall hook",
      whatItIs: null,
      decisions: [],
      more: [],
    });
    expect(readmeSections(`${started}\nHolds a bike up by its front wheel.\n`).whatItIs).toBe(
      "Holds a bike up by its front wheel.",
    );
  });

  it("gives empty sections for a missing or empty README", () => {
    const empty = { title: null, whatItIs: null, decisions: [], more: [] };
    expect(readmeSections(null)).toEqual(empty);
    expect(readmeSections("  \n")).toEqual(empty);
  });
});

describe("readmeInline", () => {
  it("splits a line into text, links and bold, and drops code marks", () => {
    expect(
      readmeInline("[First fit concept](parts/bike_hook.step) · **PETG** and `bike_hook.py`"),
    ).toEqual([
      { kind: "link", text: "First fit concept", target: "parts/bike_hook.step" },
      { kind: "text", text: " · " },
      { kind: "strong", text: "PETG" },
      { kind: "text", text: " and bike_hook.py" },
    ]);
    expect(readmeInline("Plain words")).toEqual([{ kind: "text", text: "Plain words" }]);
  });
});
