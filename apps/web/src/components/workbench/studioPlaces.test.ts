import { describe, expect, it } from "vite-plus/test";

import { railMark } from "./studioPlaces";

describe("railMark", () => {
  it("marks the page that shows", () => {
    expect(railMark("/")).toBe("home");
    expect(railMark("/chats")).toBe("chats");
    expect(railMark("/projects")).toBe("projects");
    expect(railMark("/needs-you")).toBe("needs");
    expect(railMark("/examples")).toBe("examples");
    expect(railMark("/examples/phone-stand")).toBe("examples");
  });

  it("marks Projects inside a project's workspace", () => {
    expect(railMark("/env-1/thread-9")).toBe("projects");
    expect(railMark("/draft/abc")).toBe("projects");
  });

  it("keeps the Library in Studio's shell, though no place on the rail is it", () => {
    expect(railMark("/library")).toBe("library");
  });

  it("marks Settings on its pages, and nothing on T3's other pages", () => {
    expect(railMark("/settings/general")).toBe("settings");
    expect(railMark("/usage")).toBeNull();
  });
});
