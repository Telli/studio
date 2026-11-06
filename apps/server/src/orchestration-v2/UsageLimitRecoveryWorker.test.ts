import { DEFAULT_SERVER_SETTINGS, type ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectionLimitRecoveryCandidate } from "./ProjectionStore.ts";
import { limitRecoveryCommand } from "./UsageLimitRecoveryWorker.ts";

const stopped = DateTime.makeUnsafe("2026-11-06T01:00:00.000Z");
const resetAt = "2026-11-06T06:00:00.000Z";
const resetMs = Date.parse(resetAt);

const limited = {
  id: "thread-1" as ThreadId,
  status: "failed",
  lastErrorClass: "usage_limit",
  latestRunId: "run-1",
  usageLimitResetAt: resetAt,
  archivedAt: null,
  settledOverride: null,
  pendingRuntimeRequest: null,
  latestRunCompletedAt: stopped,
  updatedAt: stopped,
  limitRecovery: null,
  snoozedUntil: null,
} as unknown as ProjectionLimitRecoveryCandidate;

describe("limitRecoveryCommand with the default settings", () => {
  const autoResume = DEFAULT_SERVER_SETTINGS.autoResumeLimitedThreads;
  const sweep = (thread: ProjectionLimitRecoveryCandidate, nowMs: number) =>
    limitRecoveryCommand(thread, autoResume, nowMs, DEFAULT_SERVER_SETTINGS.snoozeLimitedThreads);

  it("resumes a limited chat once, at the reset", () => {
    const armed = sweep(limited, resetMs - 60_000);
    expect(armed?.type).toBe("thread.metadata.update");
    const recovery = (armed as { limitRecovery: { autoResume: boolean } }).limitRecovery;
    expect(recovery.autoResume).toBe(true);

    const waiting = { ...limited, limitRecovery: recovery } as ProjectionLimitRecoveryCandidate;
    expect(sweep(waiting, resetMs - 1)).toBeNull();

    const resumed = sweep(waiting, resetMs);
    expect(resumed?.type).toBe("message.dispatch");
    // The same id if the sweep runs again before the run starts, so it delivers once.
    expect(sweep(waiting, resetMs + 60_000)?.commandId).toBe(resumed?.commandId);
    // Once it runs, the chat is no longer limited, and nothing more is sent.
    expect(
      sweep(
        { ...waiting, status: "running" } as ProjectionLimitRecoveryCandidate,
        resetMs + 60_000,
      ),
    ).toBeNull();
  });

  it("leaves a chat whose person cancelled it", () => {
    const cancelled = {
      ...limited,
      limitRecovery: { runId: "run-1", resetAt, autoResume: false, snooze: false },
    } as unknown as ProjectionLimitRecoveryCandidate;
    expect(sweep(cancelled, resetMs + 1)).toBeNull();
  });
});
