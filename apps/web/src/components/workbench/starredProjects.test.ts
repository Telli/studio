import { describe, expect, it } from "vite-plus/test";

import { splitStarred } from "./starredProjects";

describe("starred projects", () => {
  it("puts the starred ones apart, each group in the list's order", () => {
    const cards = [{ id: "lamp" }, { id: "rover" }, { id: "hook" }, { id: "clip" }];
    expect(splitStarred(cards, ["hook", "lamp", "gone"])).toEqual({
      starred: [{ id: "lamp" }, { id: "hook" }],
      rest: [{ id: "rover" }, { id: "clip" }],
    });
  });
});
