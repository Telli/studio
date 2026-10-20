import { describe, expect, it } from "vite-plus/test";

import { studioNavSection } from "./studioNav";

describe("studioNavSection", () => {
  it("places Home and Projects", () => {
    expect(studioNavSection("/")).toBe("home");
    expect(studioNavSection("/projects")).toBe("projects");
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
