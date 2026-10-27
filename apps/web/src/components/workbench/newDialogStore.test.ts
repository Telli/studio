import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useNewDialogStore } from "./newDialogStore";

describe("useNewDialogStore", () => {
  beforeEach(() => {
    useNewDialogStore.getState().take(true);
  });

  it("hands a request to one New, and leaves none for the next", () => {
    useNewDialogStore.getState().ask("Documents", "prd");
    expect(useNewDialogStore.getState().take(false)).toEqual({
      discipline: "Documents",
      templateId: "prd",
      newProject: false,
    });
    expect(useNewDialogStore.getState().request).toBeNull();
    expect(useNewDialogStore.getState().take(true)).toBeNull();
  });

  it("opens on what the last ask named, if none was taken in between", () => {
    useNewDialogStore.getState().ask("Documents");
    useNewDialogStore.getState().ask("CAD", "part");
    expect(useNewDialogStore.getState().take(true)).toEqual({
      discipline: "CAD",
      templateId: "part",
      newProject: false,
    });
  });

  it("keeps New project for a New that makes one, past a project's own New", () => {
    useNewDialogStore.getState().askNewProject();
    expect(useNewDialogStore.getState().take(false)).toBeNull();
    expect(useNewDialogStore.getState().request).not.toBeNull();
    expect(useNewDialogStore.getState().take(true)).toEqual({
      discipline: null,
      templateId: null,
      newProject: true,
    });
  });
});
