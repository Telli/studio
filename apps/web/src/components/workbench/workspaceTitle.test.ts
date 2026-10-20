import { describe, expect, it } from "vite-plus/test";

import { chatLabel, projectChats, workspaceTitle } from "./workspaceTitle";

describe("workspaceTitle", () => {
  it("uses the Studio project's name", () => {
    expect(workspaceTitle("Lanyard clip", "/p/clip")).toBe("Lanyard clip");
  });

  it("falls back to the folder's own name for a folder in no project", () => {
    expect(workspaceTitle(null, "/Users/amy/projects/servo-bracket/")).toBe("servo-bracket");
    expect(workspaceTitle("  ", "C:\\work\\gear guard")).toBe("gear guard");
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
