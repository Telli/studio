import { describe, expect, it } from "vite-plus/test";

import { noProjectChats } from "./freeformChat";

describe("a chat in no project", () => {
  it("lists only the chats in the projects' folder, on this environment", () => {
    const thread = (id: string, environmentId: string, projectId: string) =>
      ({ id, environmentId, projectId }) as never;
    const threads = [
      thread("a", "env", "free"),
      thread("b", "env", "bracket"),
      thread("c", "other", "free"),
    ];
    expect(
      noProjectChats(threads, "env" as never, "free").map((each: { id: string }) => each.id),
    ).toEqual(["a"]);
    expect(noProjectChats(threads, "env" as never, null)).toEqual([]);
  });
});
