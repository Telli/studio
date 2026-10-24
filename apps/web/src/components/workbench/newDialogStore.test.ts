import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useNewDialogStore } from "./newDialogStore";

describe("useNewDialogStore", () => {
  beforeEach(() => {
    useNewDialogStore.getState().take();
  });

  it("hands a request to one New, and leaves none for the next", () => {
    useNewDialogStore.getState().ask("Documents", "prd");
    expect(useNewDialogStore.getState().take()).toEqual({
      discipline: "Documents",
      templateId: "prd",
    });
    expect(useNewDialogStore.getState().request).toBeNull();
    expect(useNewDialogStore.getState().take()).toBeNull();
  });

  it("opens on what the last ask named, if none was taken in between", () => {
    useNewDialogStore.getState().ask("Documents");
    useNewDialogStore.getState().ask("CAD", "part");
    expect(useNewDialogStore.getState().take()).toEqual({ discipline: "CAD", templateId: "part" });
  });
});
