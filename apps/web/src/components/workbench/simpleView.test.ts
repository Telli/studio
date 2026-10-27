import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  readSimpleView,
  setSimpleView,
  modeOf,
  simpleOf,
  simpleViewToggle,
  useSimpleViewStore,
  viewerEditLayout,
} from "./simpleView";

const KEY = "studio:simple-view";

/** This device's storage, as the page has it. */
function storage(values = new Map<string, string>()) {
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

/** Studio started again, reading the choice from storage as it opens. */
async function restart() {
  vi.resetModules();
  return (await import("./simpleView")).useSimpleViewStore.getState().on;
}

describe("Simple view", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useSimpleViewStore.setState({ on: false });
  });

  it("opens in AI the first time, where no choice was ever kept, and a kept CAD stays CAD", async () => {
    vi.stubGlobal("localStorage", storage());
    expect(readSimpleView()).toBe(true);
    expect(await restart()).toBe(true);
    expect(viewerEditLayout(true)).toBe("ai");
    // A choice of CAD kept before AI became home is the person's: it stays.
    vi.stubGlobal("localStorage", storage(new Map([[KEY, "0"]])));
    expect(readSimpleView()).toBe(false);
    expect(await restart()).toBe(false);
    vi.stubGlobal("localStorage", storage(new Map([[KEY, "1"]])));
    expect(readSimpleView()).toBe(true);
    // A project's mode from before Simple view came says nothing of it: AI still.
    vi.stubGlobal(
      "localStorage",
      storage(new Map([["studio:workspace-modes", JSON.stringify({ "/p/clip": "manual" })]])),
    );
    expect(await restart()).toBe(true);
  });

  it("remembers the choice across projects", async () => {
    const before = JSON.stringify({ "/p/clip": "manual" });
    const stored = storage(new Map([["studio:workspace-modes", before]]));
    vi.stubGlobal("localStorage", stored);
    setSimpleView(true);
    expect(useSimpleViewStore.getState().on).toBe(true);
    expect(viewerEditLayout(true)).toBe("ai");
    // One choice for the person, not for a folder: every project opens in it, after a restart too.
    expect(await restart()).toBe(true);
    // The old per-project choices are left as they were.
    expect(stored.values.get("studio:workspace-modes")).toBe(before);
    // And off again, the way it came.
    setSimpleView(false);
    expect(stored.values.has(KEY)).toBe(true);
    expect(await restart()).toBe(false);
  });

  it("still works when storage throws", async () => {
    const blocked = () => {
      throw new Error("Storage is off");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    // Nothing can have been kept: AI, as the first time.
    expect(await restart()).toBe(true);
    const { setSimpleView: set, useSimpleViewStore: store } = await import("./simpleView");
    expect(() => set(true)).not.toThrow();
    // The choice holds for the session.
    expect(store.getState().on).toBe(true);
    set(false);
    expect(store.getState().on).toBe(false);
  });

  it("shows the toggle only where there are two layouts", () => {
    // A view that has said nothing, or is gone.
    expect(simpleViewToggle(undefined)).toBe("hidden");
    // An imported STEP, with no part script beside it: the viewer's one layout.
    expect(simpleViewToggle({ editable: false, busy: false })).toBe("hidden");
    expect(simpleViewToggle({ editable: true, busy: false })).toBe("shown");
    // A command or sketch open holds it until it is finished or cancelled.
    expect(simpleViewToggle({ editable: true, busy: true })).toBe("held");
  });
});

describe("the AI | CAD switch", () => {
  it("reads the Simple view choice as AI, and the full workspace as CAD", () => {
    expect(modeOf(true)).toBe("ai");
    expect(modeOf(false)).toBe("cad");
    expect(simpleOf("ai")).toBe(true);
    expect(simpleOf("cad")).toBe(false);
  });
});
