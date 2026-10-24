import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { frontViewBusy, pluginViewKey, useViewerEditState } from "./viewerEditState";

const surface = "plugin:cad/cad/cad_open:parts%2Fbracket.step";
const thread = scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("thread-1"));
const view = pluginViewKey(thread, surface);

describe("the viewer's edit state", () => {
  afterEach(() => useViewerEditState.setState({ byView: {} }));

  it("forgets a view when it closes", () => {
    useViewerEditState.getState().set(view, { editable: true, busy: true });
    expect(useViewerEditState.getState().byView[view]).toEqual({ editable: true, busy: true });
    useViewerEditState.getState().remove(view);
    expect(useViewerEditState.getState().byView).toEqual({});
  });

  it("never holds Simple view for a view that is gone", () => {
    // A command open in the view, then the view closed mid-command.
    useViewerEditState.getState().set(view, { editable: true, busy: true });
    expect(frontViewBusy(useViewerEditState.getState().byView, view)).toBe(true);
    useViewerEditState.getState().remove(view);
    expect(frontViewBusy(useViewerEditState.getState().byView, view)).toBe(false);
    // A view that never said anything, and no view in front at all.
    expect(frontViewBusy(useViewerEditState.getState().byView, "local:thread-2|plugin:cad")).toBe(
      false,
    );
    expect(frontViewBusy(useViewerEditState.getState().byView, null)).toBe(false);
  });

  it("keeps each thread's view apart, the same tab in two threads too", () => {
    const other = pluginViewKey(
      scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("thread-2")),
      surface,
    );
    expect(other).not.toBe(view);
    useViewerEditState.getState().set(view, { editable: true, busy: true });
    useViewerEditState.getState().set(other, { editable: true, busy: false });
    useViewerEditState.getState().remove(other);
    expect(useViewerEditState.getState().byView).toEqual({
      [view]: { editable: true, busy: true },
    });
  });
});
