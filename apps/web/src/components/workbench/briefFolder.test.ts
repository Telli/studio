import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_BRIEF,
  agentsWithBrief,
  briefMarkdown,
  claudeWithBrief,
  parseBrief,
} from "./briefFolder";

const brief = {
  ...EMPTY_BRIEF,
  purpose: "A wall bracket for a 5 kg shelf.",
  requirements: "Holds 50 N at the tip with a safety factor of 2.",
  material: "6061-T6 aluminum",
  process: "CNC machining" as const,
  quantity: "20",
  links: "https://example.com/datasheet.pdf\n\n",
};

describe("project brief", () => {
  it("round-trips the form through brief.json and keeps unknown values safe", () => {
    expect(parseBrief(JSON.stringify(brief))).toEqual(brief);
    expect(parseBrief(JSON.stringify({ process: "Welding", units: "ft" }))).toEqual(EMPTY_BRIEF);
    expect(parseBrief("not json")).toBeNull();
    expect(parseBrief(null)).toBeNull();
  });

  it("writes project.md with the spec as a table and leaves empty sections out", () => {
    const markdown = briefMarkdown(brief, "Shelf bracket");
    expect(markdown).toContain("# Shelf bracket: project brief");
    expect(markdown).toContain("| Material | 6061-T6 aluminum |");
    expect(markdown).toContain("| Process | CNC machining |");
    expect(markdown).toContain("- https://example.com/datasheet.pdf");
    expect(markdown).not.toContain("## Notes");
  });

  it("points AGENTS.md and CLAUDE.md at the brief once", () => {
    const agents = agentsWithBrief("# Rules\n\nUse metric.\n")!;
    expect(agents).toContain("Use metric.");
    expect(agents).toContain("Read `brief/project.md` before any design work");
    expect(agentsWithBrief(agents)).toBeNull();
    expect(agentsWithBrief(null)).toMatch(/^# Agent instructions/);

    expect(claudeWithBrief(null)).toBe("@AGENTS.md\n");
    expect(claudeWithBrief("@AGENTS.md\n")).toBeNull();
    const claude = claudeWithBrief("Be brief.")!;
    expect(claude).toContain("@brief/project.md");
    expect(claudeWithBrief(claude)).toBeNull();
  });
});
