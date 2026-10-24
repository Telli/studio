import assert from "node:assert/strict";
import test from "node:test";
import { renderHook } from "../../../../scripts/reactHarness.mjs";
import { createViewSettingsStore } from "../../kit/view-settings/viewSettingsStore.js";
import { useStepViewPolicy } from "./useStepViewPolicy.js";

// The policy a STEP's layers draw from, with the workspace's selection colour (`selectionColor`) or
// without one, as Simple view's ai layout has it.
function policy(selectionColor) {
  const { scene } = createViewSettingsStore({}, { appearance: "light", lightingQuality: "preview" }).getSnapshot();
  return renderHook(() => useStepViewPolicy({ meshData: null, themeSettings: scene.theme, displaySettings: scene.display,
    renderMode: false, renderConfiguration: scene.render.configuration, hiddenPartIds: ["hidden"], selectionColor })).result;
}

test("the workspace lights a pick, and what the pointer rests on, in its orange; the ai layout keeps the viewer's own colour", () => {
  const own = policy(null);
  const workspace = policy("#ff9a2e");
  // Every layer that lights a pick reads it from these: a face's or an edge's lines and fill, a part's
  // tint and its edges, posed or not.
  for (const settings of ["displayEdgeSettings", "visualEdgeSettings", "hiddenAwareVisualEdgeSettings"]) {
    assert.deepEqual([workspace[settings].highlightColor, workspace[settings].hoverColor], ["#ff9a2e", "#ff9a2e"], settings);
    assert.notEqual(own[settings].highlightColor, "#ff9a2e", settings);
    assert.equal(own[settings].hoverColor, undefined, settings);
  }
  // Nothing else of the edges changes with it.
  const { highlightColor, hoverColor, ...edges } = workspace.displayEdgeSettings;
  const { highlightColor: ownHighlight, ...ownEdges } = own.displayEdgeSettings;
  assert.deepEqual(edges, ownEdges);
});
