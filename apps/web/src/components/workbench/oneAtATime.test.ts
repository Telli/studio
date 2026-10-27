import { describe, expect, it } from "vite-plus/test";

import { oneAtATime } from "./oneAtATime";

/** Work that finishes when told to, counting how often it was started. */
function heldWork() {
  let finish = () => {};
  let started = 0;
  const work = () => {
    started += 1;
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  return { work, started: () => started, finish: () => finish() };
}

describe("oneAtATime", () => {
  it("runs a second press while the first is under way as nothing more", async () => {
    const underWay = new Map<string, Promise<void>>();
    const held = heldWork();
    const first = oneAtATime(underWay, "/p/bracket", held.work);
    const second = oneAtATime(underWay, "/p/bracket", held.work);
    expect(second).toBe(first);
    await Promise.resolve();
    expect(held.started()).toBe(1);
    held.finish();
    await first;
    expect(underWay.has("/p/bracket")).toBe(false);
  });

  it("keeps each key's work apart, and frees a key once its work fails", async () => {
    const underWay = new Map<string, Promise<void>>();
    const held = heldWork();
    void oneAtATime(underWay, "/p/a", held.work);
    const failing = oneAtATime(underWay, "/p/b", () => Promise.reject(new Error("no disk")));
    await expect(failing).rejects.toThrow("no disk");
    expect(underWay.has("/p/b")).toBe(false);
    expect(underWay.has("/p/a")).toBe(true);
    let again = 0;
    await oneAtATime(underWay, "/p/b", async () => {
      again += 1;
    });
    expect(again).toBe(1);
    held.finish();
  });
});
