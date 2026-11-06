import { describe, expect, it } from "vite-plus/test";

import { findProjects, projectActivity } from "./recentProjects";

const now = Date.parse("2026-10-19T20:00:00Z");
const relative = (iso: string) => `at ${iso.slice(11, 16)}`;

describe("projectActivity", () => {
  it("says a project with no chats was made", () => {
    expect(
      projectActivity({ createdAt: "2026-10-19T09:00:00Z", threads: [], now, relative }),
    ).toEqual({ line: "Made at 09:00" });
  });

  it("names the latest chat and when", () => {
    const threads = [
      { title: "First draft", updatedAt: "2026-10-18T10:00:00Z" },
      { title: "Wider opening", updatedAt: "2026-10-19T18:00:00Z" },
    ];
    expect(projectActivity({ createdAt: "2026-10-01T00:00:00Z", threads, now, relative })).toEqual({
      line: "Wider opening, at 18:00",
    });
  });

  it("covers an untitled chat", () => {
    const threads = [{ title: "  ", updatedAt: "2026-10-19T12:00:00Z" }];
    expect(
      projectActivity({ createdAt: "2026-10-01T00:00:00Z", threads, now, relative }).line,
    ).toBe("Worked on at 12:00");
  });
});

describe("findProjects", () => {
  const cards = [
    { project: { name: "Lanyard clip", brief: { purpose: "Holds a phone lanyard" } }, threads: [] },
    { project: { name: "Sumo robot", brief: { purpose: "" } }, threads: [{ title: "Gear guard" }] },
  ];

  it("keeps everything for an empty search", () => {
    expect(findProjects(cards, "  ")).toHaveLength(2);
  });

  it("matches names, purposes and chat titles, ignoring case", () => {
    expect(findProjects(cards, "LANYARD").map((card) => card.project.name)).toEqual([
      "Lanyard clip",
    ]);
    expect(findProjects(cards, "phone").map((card) => card.project.name)).toEqual(["Lanyard clip"]);
    expect(findProjects(cards, "gear").map((card) => card.project.name)).toEqual(["Sumo robot"]);
  });
});
