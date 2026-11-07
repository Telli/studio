import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { waitingChats } from "./allChats";
import { chatStanding } from "./chatStanding";
import { historyOutcome } from "./projectHistory";
import { foldedStanding } from "./sidebarProjects";

const chat = (extra: object) =>
  ({
    updatedAt: "2026-11-01T00:00:00.000Z",
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    latestRun: null,
    runtime: null,
    ...extra,
  }) as unknown as EnvironmentThreadShell;

const failed = chat({ latestRun: { status: "failed" }, runtime: { status: "failed" } });
const limited = chat({
  latestRun: { status: "failed" },
  runtime: { status: "failed", lastErrorClass: "usage_limit" },
});

describe("chatStanding", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says when it was last worked on in a word, with no ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T21:30:00.000Z"));
    expect(chatStanding(chat({ updatedAt: "2026-11-01T20:44:00.000Z" })).text).toBe("46m");
    expect(chatStanding(chat({ updatedAt: "2026-11-01T00:30:00.000Z" })).text).toBe("21h");
    expect(chatStanding(chat({ updatedAt: "2026-10-31T21:00:00.000Z" })).text).toBe("1d");
  });

  it("says a failed chat failed and a limited one hit its limit", () => {
    expect(historyOutcome(limited)).toBe("limited");
    expect(chatStanding(failed).text).toBe("Failed");
    expect(chatStanding(limited).text).toBe("Usage limit");
  });

  it("goes back to the time once a later run finishes", () => {
    const later = chat({ latestRun: { status: "completed" } });
    expect(chatStanding(later).text).not.toBe("Failed");
  });

  it("a question waiting comes first, and only answers and approvals count as Needs you", () => {
    const asking = { ...limited, hasPendingUserInput: true };
    expect(chatStanding(asking).text).toBe("Needs you");
    expect(waitingChats([failed, limited, asking])).toEqual([asking]);
  });

  it("a folded project says so after those needing the person or at work", () => {
    expect(foldedStanding([chat({}), limited, failed])?.text).toBe("Failed");
    expect(foldedStanding([chat({}), limited])?.text).toBe("Usage limit");
    const asking = chat({ hasPendingApprovals: true });
    expect(foldedStanding([failed, asking])?.text).toBe("Needs you");
  });
});
