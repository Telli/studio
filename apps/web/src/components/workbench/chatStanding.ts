import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import { formatRelativeTimeShortLabel } from "~/timestampFormat";
import { historyOutcome } from "./projectHistory";

/**
 * How a chat stands, in a word, as the sidebar and the Overview's list say it: waiting on the
 * person, at work, its last run failed or hit a usage limit (until a later one finishes), else when
 * it was last worked on; with the tone to say it in.
 */
export function chatStanding(chat: EnvironmentThreadShell) {
  const outcome = historyOutcome(chat);
  if (outcome === "needs-you") return { text: "Needs you", tone: "text-info-foreground" };
  if (outcome === "working") return { text: "Working", tone: "text-foreground" };
  if (outcome === "failed") return { text: "Failed", tone: "text-destructive" };
  if (outcome === "limited") return { text: "Usage limit", tone: "text-warning-foreground" };
  return { text: formatRelativeTimeShortLabel(chat.updatedAt), tone: "text-muted-foreground" };
}
