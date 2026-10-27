import { describe, expect, it } from "vite-plus/test";

import { studioNavSection } from "./studioNav";

describe("studioNavSection", () => {
  it("places Studio's pages: Home, Chats and Projects", () => {
    expect(studioNavSection("/")).toBe("home");
    expect(studioNavSection("/chats")).toBe("chats");
    expect(studioNavSection("/projects")).toBe("projects");
  });

  it("places each example's page under the Library, never as a thread", () => {
    expect(studioNavSection("/library/examples/phone-stand")).toBe("library");
  });

  it("places Trash", () => {
    expect(studioNavSection("/trash")).toBe("trash");
  });

  it("places the Library", () => {
    expect(studioNavSection("/library")).toBe("library");
  });

  it("treats a thread, a draft and a new chat as the workspace", () => {
    expect(studioNavSection("/env-1/thread-9")).toBe("workspace");
    expect(studioNavSection("/draft/abc")).toBe("workspace");
    expect(studioNavSection("/new")).toBe("workspace");
  });

  it("leaves T3's own pages to T3's shell", () => {
    expect(studioNavSection("/settings/general")).toBe("other");
    expect(studioNavSection("/settings")).toBe("other");
    expect(studioNavSection("/projects/key-1")).toBe("other");
    expect(studioNavSection("/usage")).toBe("other");
    expect(studioNavSection("/pull-requests")).toBe("other");
    expect(studioNavSection("/welcome")).toBe("other");
  });
});
