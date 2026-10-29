import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  type PluginAppSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "~/rightPanelStore";
import { showOverview, showProject, takeOpeningProject, useOpeningProjects } from "./overviewPanel";
import { setSimpleView, useSimpleViewStore } from "./simpleView";

const THREAD = scopeThreadRef(EnvironmentId.make("environment-local"), ThreadId.make("thread-1"));

const BRACKET: PluginAppSurface = {
  id: "plugin:text-to-cad/cad/cad_open:bracket",
  kind: "plugin-app",
  pluginId: "text-to-cad",
  server: "cad",
  tool: "cad_open",
  title: "Bracket",
  resourceUri: "ui://cad/viewer",
  arguments: {},
};

const panel = () => selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, THREAD);

describe("opening a project", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ byThreadKey: {}, threadPanelVisibilityByThreadKey: {} });
    useOpeningProjects.setState({ threads: new Set() });
    setSimpleView(true);
  });

  it("brings back the part left open, beside the chat, in CAD mode", () => {
    useRightPanelStore.getState().openPluginApp(THREAD, BRACKET);
    // Left on its Overview across the window last time.
    showOverview(THREAD);

    showProject(THREAD);

    expect(panel().activeSurfaceId).toBe(BRACKET.id);
    expect(panel().maximized).toBeUndefined();
    expect(useSimpleViewStore.getState().on).toBe(false);
    expect(takeOpeningProject(THREAD)).toBe(false);
  });

  it("with no part open, waits once for the workspace to find its main part", () => {
    showProject(THREAD);

    expect(panel().surfaces).toEqual([]);
    expect(takeOpeningProject(THREAD)).toBe(true);
    expect(takeOpeningProject(THREAD)).toBe(false);
  });
});
