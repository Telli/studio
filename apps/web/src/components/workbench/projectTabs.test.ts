import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { followFolderTabs } from "./projectTabs";

const chat = (id: string) => scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(id));
const first = chat("first");
const second = chat("second");
const elsewhere = chat("elsewhere");
const tabs = (ref: ReturnType<typeof chat>) =>
  selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, ref).surfaces.map(
    (surface) => surface.id,
  );

beforeEach(() => {
  useRightPanelStore.setState({
    byThreadKey: {},
    threadPanelVisibilityByThreadKey: {},
    userActionRevisionByThreadKey: {},
    closeRevisionByThreadKey: {},
  });
});

describe("a project's tabs", () => {
  it("are the same beside every chat of its folder, as a Chrome window's tabs", () => {
    const panels = useRightPanelStore.getState();
    const stopFirst = followFolderTabs(scopedThreadKey(first), "/projects/clip");
    panels.open(first, "files");
    panels.openFile(first, "parts/clip.step");
    stopFirst();

    // The next chat opened in the folder shows them, the part in front.
    const stopSecond = followFolderTabs(scopedThreadKey(second), "/projects/clip");
    expect(tabs(second)).toEqual(tabs(first));
    expect(
      useRightPanelStore.getState().byThreadKey[scopedThreadKey(second)]?.activeSurfaceId,
    ).toBe("file:parts/clip.step");

    // What it opens is the folder's too, back in the first chat.
    panels.openFile(second, "drawings/clip.dxf");
    stopSecond();
    followFolderTabs(scopedThreadKey(first), "/projects/clip")();
    expect(tabs(first)).toContain("file:drawings/clip.dxf");
  });

  it("stay their own folder's", () => {
    const panels = useRightPanelStore.getState();
    const stop = followFolderTabs(scopedThreadKey(first), "/projects/clip");
    panels.openFile(first, "parts/clip.step");
    stop();
    followFolderTabs(scopedThreadKey(elsewhere), "/projects/bracket")();
    expect(tabs(elsewhere)).toEqual([]);
  });
});
