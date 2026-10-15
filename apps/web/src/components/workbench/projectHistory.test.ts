import { describe, expect, it } from "vite-plus/test";

import { historyByDay, historyDay, historyOutcome } from "./projectHistory";

const idle = {
  runtime: null,
  latestRun: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
};
const run = (status: "completed" | "failed" | "interrupted") =>
  ({
    runId: "r",
    status,
    requestedAt: null,
    startedAt: null,
    completedAt: null,
    assistantMessageId: null,
  }) as never;

describe("project history", () => {
  // Thursday 2026-10-15, 3:00 PM local.
  const now = new Date(2026, 9, 15, 15, 0).getTime();
  const at = (month: number, day: number, hour = 10) =>
    new Date(2026, month, day, hour).toISOString();

  it("files work under the day it was last worked on", () => {
    expect(historyDay(at(9, 15, 9), now)).toBe("Today");
    expect(historyDay(at(9, 14, 23), now)).toBe("Yesterday");
    expect(historyDay(at(9, 12), now)).toBe("Monday");
    expect(historyDay(at(8, 30), now)).toBe("Sep 30");
    expect(historyDay(new Date(2025, 11, 1).toISOString(), now)).toBe("Dec 1, 2025");
  });

  it("lists it newest first, a run per day", () => {
    const threads = [
      { id: "a", updatedAt: at(9, 14) },
      { id: "b", updatedAt: at(9, 15, 9) },
      { id: "c", updatedAt: at(9, 15, 12) },
    ];
    expect(
      historyByDay(threads, now).map(({ day, threads }) => [day, threads.map((t) => t.id)]),
    ).toEqual([
      ["Today", ["c", "b"]],
      ["Yesterday", ["a"]],
    ]);
  });

  it("says how each piece of work came out, the person's turn first", () => {
    expect(historyOutcome(idle)).toBe("not-started");
    expect(historyOutcome({ ...idle, latestRun: run("completed") })).toBe("done");
    expect(historyOutcome({ ...idle, latestRun: run("failed") })).toBe("failed");
    expect(historyOutcome({ ...idle, latestRun: run("interrupted") })).toBe("stopped");
    expect(historyOutcome({ ...idle, latestRun: run("failed"), hasPendingUserInput: true })).toBe(
      "needs-you",
    );
  });
});
