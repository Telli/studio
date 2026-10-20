import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useWorkspaceModeStore, viewerEditLayout, workspaceModeFor } from "./workspaceMode";

describe("workspace mode", () => {
  beforeEach(() => {
    useWorkspaceModeStore.setState({ modes: {}, activeFolder: null });
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

  it("gives the views on screen the active workspace's mode", () => {
    const store = useWorkspaceModeStore.getState();
    store.setMode("/p/clip", "manual");
    store.setActiveFolder("/p/clip");
    const { modes, activeFolder } = useWorkspaceModeStore.getState();
    expect(viewerEditLayout(workspaceModeFor(modes, activeFolder))).toBe("manual");
    useWorkspaceModeStore.getState().setActiveFolder("/p/bracket");
    const next = useWorkspaceModeStore.getState();
    expect(viewerEditLayout(workspaceModeFor(next.modes, next.activeFolder))).toBe("ai");
  });

  it("maps to the viewer's edit layout", () => {
    expect(viewerEditLayout("ask")).toBe("ai");
    expect(viewerEditLayout("manual")).toBe("manual");
  });
});
