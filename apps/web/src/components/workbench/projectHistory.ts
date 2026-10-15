import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";

import type { ThreadShell } from "~/types";

/**
 * A project's threads as its design history: each a piece of work on the
 * design, filed under the day it was last worked on, with how it came out.
 */

/** How a piece of work stands: at work, waiting on the person, stopped, or done. */
export type HistoryOutcome =
  | "working"
  | "needs-you"
  | "failed"
  | "stopped"
  | "done"
  | "not-started";

export function historyOutcome(
  thread: Pick<
    ThreadShell,
    | "runtime"
    | "latestRun"
    | "hasPendingApprovals"
    | "hasPendingUserInput"
    | "hasActionableProposedPlan"
  >,
): HistoryOutcome {
  if (
    thread.hasPendingApprovals ||
    thread.hasPendingUserInput ||
    thread.hasActionableProposedPlan
  ) {
    return "needs-you";
  }
  if (threadRuntimeIsActive(thread.runtime)) return "working";
  switch (thread.latestRun?.status) {
    case undefined:
      return "not-started";
    case "failed":
      return "failed";
    case "interrupted":
    case "cancelled":
    case "rolled_back":
      return "stopped";
    default:
      return "done";
  }
}

const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthDayYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" });

/** The day a piece of work is filed under: "Today", "Yesterday", "Monday" this week, else "Oct 12". */
export function historyDay(iso: string, nowMs: number = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Earlier";
  const now = new Date(nowMs);
  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  // Rounded, so a day that DST makes 23 or 25 hours long still counts as one.
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return weekday.format(date);
  return (date.getFullYear() === now.getFullYear() ? monthDay : monthDayYear).format(date);
}

/** Threads newest first, in runs of one day each. */
export function historyByDay<T extends { readonly updatedAt: string }>(
  threads: ReadonlyArray<T>,
  nowMs: number = Date.now(),
): Array<{ readonly day: string; readonly threads: T[] }> {
  const days: Array<{ day: string; threads: T[] }> = [];
  for (const thread of threads.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const day = historyDay(thread.updatedAt, nowMs);
    const last = days.at(-1);
    if (last?.day === day) last.threads.push(thread);
    else days.push({ day, threads: [thread] });
  }
  return days;
}
