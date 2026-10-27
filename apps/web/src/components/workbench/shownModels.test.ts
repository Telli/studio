import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { noteViewCall, shownView } from "./shownModels";

const ref = { environmentId: "env-1" as EnvironmentId, threadId: ThreadId.make("thread-A") };
const sync = (model: string, revision: string) => ({
  ...ref,
  pluginId: "text-to-cad",
  server: "cad",
  name: "cad_sync",
  arguments: { view: "v", surface: "thread", model },
  result: {
    structuredContent: {
      events: [],
      catalog: { revision },
    },
  },
});

describe("shown models", () => {
  it("follows what the thread's viewer syncs, waking only on a change", () => {
    noteViewCall(sync("/work/bracket.step", "1"));
    const first = shownView(ref);
    expect(first).toMatchObject({ path: "/work/bracket.step", revision: "1" });
    // The next second's sync says the same: the same answer, nothing re-renders.
    noteViewCall(sync("/work/bracket.step", "1"));
    expect(shownView(ref)).toBe(first);

    // A model is shown by its document id, and its rebuild moves the catalog's revision.
    const model = "0b9c3c1e-5d0a-5f8e-9a43-2f1d6c7b8a90";
    noteViewCall(sync(model, "m1"));
    expect(shownView(ref)).toMatchObject({ path: model, revision: "m1" });
    noteViewCall(sync(model, "m2"));
    expect(shownView(ref)).toMatchObject({ path: model, revision: "m2" });
    noteViewCall(sync("/work/plate.step", "4"));
    expect(shownView(ref)).toMatchObject({ path: "/work/plate.step", revision: "4" });
  });

  it("keeps the last model when the view goes home or a call is not a sync", () => {
    noteViewCall(sync("/work/bracket.step", "2"));
    noteViewCall({ ...sync("/work/bracket.step", "2"), arguments: { view: "v", model: null } });
    noteViewCall({ ...sync("/work/other.step", "9"), name: "cad_http" });
    expect(shownView(ref)?.path).toBe("/work/bracket.step");
  });
});
