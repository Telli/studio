import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useWorkspaceModeStore, viewerEditLayout, workspaceModeFor } from "./workspaceMode";

describe("workspace mode", () => {
  beforeEach(() => {
    useWorkspaceModeStore.setState({ modes: {} });
  });

  it("starts every project in Ask", () => {
    expect(workspaceModeFor(useWorkspaceModeStore.getState().modes, "/p/clip")).toBe("ask");
  });

  it("remembers Edit by hand per project folder", () => {
    useWorkspaceModeStore.getState().setMode("/p/clip/", "manual");
    const { modes } = useWorkspaceModeStore.getState();
    expect(workspaceModeFor(modes, "/p/clip")).toBe("manual");
    expect(workspaceModeFor(modes, "/p/bracket")).toBe("ask");
  });

  it("maps to the viewer's edit layout", () => {
    expect(viewerEditLayout("ask")).toBe("ai");
    expect(viewerEditLayout("manual")).toBe("manual");
  });
});
