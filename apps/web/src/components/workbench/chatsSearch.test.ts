import { describe, expect, it } from "vite-plus/test";

import { validateChatsSearch } from "./chatsSearch";

describe("validateChatsSearch", () => {
  it("keeps the Needs you filter", () => {
    expect(validateChatsSearch({ filter: "needs-you" })).toEqual({ filter: "needs-you" });
  });

  it("leaves out a filter it does not know, and shows every chat with none", () => {
    expect(validateChatsSearch({ filter: "archived" }).filter).toBeUndefined();
    expect(validateChatsSearch({ filter: 3 }).filter).toBeUndefined();
    expect(validateChatsSearch({}).filter).toBeUndefined();
  });
});
