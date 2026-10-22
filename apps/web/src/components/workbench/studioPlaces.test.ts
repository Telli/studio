import { describe, expect, it } from "vite-plus/test";

import { listOnPageChange, railMark } from "./studioPlaces";

describe("railMark", () => {
  it("marks the list while it shows, on any page", () => {
    expect(railMark({ pathname: "/", listOpen: true, list: "chats" })).toBe("chats");
    expect(railMark({ pathname: "/env/thread", listOpen: true, list: "needs" })).toBe("needs");
  });

  it("marks Home while Home shows on its own, and nothing in a project with the list folded", () => {
    expect(railMark({ pathname: "/", listOpen: false, list: "projects" })).toBe("home");
    expect(railMark({ pathname: "/env/thread", listOpen: false, list: "projects" })).toBeNull();
  });

  it("marks Settings on its pages", () => {
    expect(railMark({ pathname: "/settings/general", listOpen: true, list: "chats" })).toBe(
      "settings",
    );
  });
});

describe("listOnPageChange", () => {
  it("folds the list away on arriving at Home, remembering how it was", () => {
    expect(
      listOnPageChange({ wasHome: false, isHome: true, open: true, openBeforeHome: null }),
    ).toEqual({ open: false, openBeforeHome: true });
  });

  it("brings the list back as it was on leaving Home", () => {
    expect(
      listOnPageChange({ wasHome: true, isHome: false, open: false, openBeforeHome: true }),
    ).toEqual({ open: true, openBeforeHome: null });
    expect(
      listOnPageChange({ wasHome: true, isHome: false, open: false, openBeforeHome: false }),
    ).toEqual({ open: false, openBeforeHome: null });
  });

  it("keeps a list the person opened on Home open as they leave through it", () => {
    expect(
      listOnPageChange({ wasHome: true, isHome: false, open: true, openBeforeHome: false }),
    ).toEqual({ open: true, openBeforeHome: null });
  });

  it("leaves a list the person opened on Home alone while they stay", () => {
    expect(
      listOnPageChange({ wasHome: true, isHome: true, open: true, openBeforeHome: false }),
    ).toEqual({ open: true, openBeforeHome: false });
  });

  it("opens the list on leaving a Home the app started on", () => {
    const arrived = listOnPageChange({
      wasHome: false,
      isHome: true,
      open: true,
      openBeforeHome: null,
    });
    expect(listOnPageChange({ wasHome: true, isHome: false, ...arrived })).toEqual({
      open: true,
      openBeforeHome: null,
    });
  });
});
