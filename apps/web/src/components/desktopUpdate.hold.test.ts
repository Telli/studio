import { Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import { restartWhenIdle, type HeldRestart } from "./desktopUpdate.hold";

function setup(running: number) {
  const registry = AtomRegistry.make();
  const count = Atom.make(running);
  // Mounted, as the app's own thread list is while it runs.
  registry.mount(count);
  const restarts: Array<string> = [];
  let held: HeldRestart | null = null;
  let released = 0;
  restartWhenIdle({
    registry,
    running: count,
    restart: () => restarts.push("restart"),
    hold: (next) => {
      held = next;
      return () => {
        released += 1;
      };
    },
  });
  return {
    set: (value: number) => registry.set(count, value),
    restarts,
    held: () => held,
    released: () => released,
  };
}

describe("restartWhenIdle", () => {
  it("restarts at once when no chat is working", () => {
    const run = setup(0);
    expect(run.restarts).toEqual(["restart"]);
    expect(run.held()).toBeNull();
  });

  it("waits for the working chats, then restarts once", () => {
    const run = setup(2);
    expect(run.held()?.running).toBe(2);
    run.set(1);
    expect(run.restarts).toEqual([]);
    run.set(0);
    run.set(1);
    run.set(0);
    expect(run.restarts).toEqual(["restart"]);
    expect(run.released()).toBe(1);
  });

  it("restarts now when asked, and not again when the chats finish", () => {
    const run = setup(1);
    run.held()?.now();
    run.set(0);
    expect(run.restarts).toEqual(["restart"]);
  });

  it("gives up the restart when cancelled", () => {
    const run = setup(1);
    run.held()?.cancel();
    run.set(0);
    expect(run.restarts).toEqual([]);
    expect(run.released()).toBe(1);
  });
});
