import { assert, describe, it } from "@effect/vitest";

import { dueRetries, type Retry, retryDelay } from "./listingRetries.ts";

describe("listingRetries", () => {
  it("lists a failing plugin again soon, then further apart, and forgets it once it works", () => {
    const held = new Map<string, Retry>();
    // Seen failing: it waits its first delay.
    assert.deepEqual(dueRetries(["cad"], held, 0), []);
    assert.deepEqual(dueRetries(["cad"], held, retryDelay(0) - 1), []);
    assert.deepEqual(dueRetries(["cad"], held, retryDelay(0)), ["cad"]);
    // Still failing: the next wait is longer.
    const second = retryDelay(0) + retryDelay(1);
    assert.isAbove(retryDelay(1), retryDelay(0));
    assert.deepEqual(dueRetries(["cad"], held, second - 1), []);
    assert.deepEqual(dueRetries(["cad"], held, second), ["cad"]);
    // Working again (or turned off): forgotten, so a later failure starts from the first delay.
    assert.deepEqual(dueRetries([], held, second + 1), []);
    assert.strictEqual(held.size, 0);
    assert.deepEqual(dueRetries(["cad"], held, second + 2), []);
    assert.strictEqual(held.get("cad")?.attempt, 0);
  });

  it("waits at most half an hour between tries", () => {
    assert.strictEqual(retryDelay(0), 10_000);
    assert.strictEqual(retryDelay(20), 30 * 60_000);
  });
});
