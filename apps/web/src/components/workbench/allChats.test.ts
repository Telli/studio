import { describe, expect, it } from "vite-plus/test";

import { allChats } from "./allChats";

const chat = (id: string, updatedAt: string, archivedAt: string | null = null) => ({
  id,
  updatedAt,
  archivedAt,
});

describe("allChats", () => {
  it("lists every project's chats newest first, each with its project's name", () => {
    const { chats, projectOf } = allChats([
      {
        name: "L bracket",
        threads: [chat("a", "2026-10-20T10:00:00Z"), chat("b", "2026-10-22T09:00:00Z")],
      },
      { name: "Drone frame", threads: [chat("c", "2026-10-21T12:00:00Z")] },
    ]);
    expect(chats.map((each) => each.id)).toEqual(["b", "c", "a"]);
    expect(projectOf.get("b")).toBe("L bracket");
    expect(projectOf.get("c")).toBe("Drone frame");
  });

  it("leaves archived chats out", () => {
    const { chats } = allChats([
      {
        name: "L bracket",
        threads: [
          chat("a", "2026-10-20T10:00:00Z"),
          chat("b", "2026-10-22T09:00:00Z", "2026-10-22"),
        ],
      },
    ]);
    expect(chats.map((each) => each.id)).toEqual(["a"]);
  });

  it("lists a chat two projects share once, under the first", () => {
    const shared = chat("a", "2026-10-20T10:00:00Z");
    const { chats, projectOf } = allChats([
      { name: "L bracket", threads: [shared] },
      { name: "Drone frame", threads: [shared] },
    ]);
    expect(chats).toHaveLength(1);
    expect(projectOf.get("a")).toBe("L bracket");
  });
});
