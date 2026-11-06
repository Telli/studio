import { describe, expect, it } from "vite-plus/test";

import { chatLabel, projectChats, workspaceTitle } from "./workspaceTitle";

describe("workspaceTitle", () => {
  it("uses the Studio project's name", () => {
    expect(workspaceTitle("Lanyard clip", "/p/clip")).toBe("Lanyard clip");
  });

  it("falls back to the folder's own name for a folder in no project", () => {
    expect(workspaceTitle(null, "/Users/amy/projects/Servo Bracket/")).toBe("Servo Bracket");
    expect(workspaceTitle("  ", "C:\\work\\gear guard")).toBe("gear guard");
  });

  it("reads a name that is only a folder's slug as a sentence", () => {
    expect(workspaceTitle(null, "/Users/amy/i-wanna-make-a-roomba-with-arms")).toBe(
      "I wanna make a roomba with arms",
    );
    expect(workspaceTitle("servo-bracket", "/p/servo-bracket")).toBe("Servo bracket");
    expect(workspaceTitle(null, "C:\\work\\m3-standoff")).toBe("M3 standoff");
  });

  it("drops a slug's leading date", () => {
    expect(workspaceTitle(null, "/p/2026-10-05-gear-guard")).toBe("Gear guard");
    expect(workspaceTitle(null, "/p/20261005-gear-guard")).toBe("Gear guard");
  });

  it("leaves a bare date, and a name a person gave, as they are", () => {
    expect(workspaceTitle(null, "/p/2026-10-05")).toBe("2026-10-05");
    expect(workspaceTitle("M3-standoff", "/p/m3-standoff")).toBe("M3-standoff");
    expect(workspaceTitle("Rev 2 bracket", "/p/rev-2")).toBe("Rev 2 bracket");
  });

  it("says New chat with no folder at all", () => {
    expect(workspaceTitle(null, null)).toBe("New chat");
  });
});

describe("projectChats", () => {
  it("lists live chats newest first", () => {
    const chats = projectChats([
      { id: "a", title: "First draft", updatedAt: "2026-10-18T10:00:00Z", archivedAt: null },
      {
        id: "b",
        title: "Old",
        updatedAt: "2026-10-19T09:00:00Z",
        archivedAt: "2026-10-19T10:00:00Z",
      },
      { id: "c", title: "Wider opening", updatedAt: "2026-10-19T18:00:00Z", archivedAt: null },
    ]);
    expect(chats.map((chat) => chat.id)).toEqual(["c", "a"]);
  });
});

describe("chatLabel", () => {
  it("names an untitled chat", () => {
    expect(chatLabel("Wider opening")).toBe("Wider opening");
    expect(chatLabel("  ")).toBe("Untitled chat");
  });
});
