import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquareIcon } from "lucide-react";
import { useMemo } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { buildThreadRouteParams } from "~/threadRoutes";
import { formatRelativeTimeLabel } from "~/timestampFormat";

/**
 * Every conversation in the project, newest first, the way a project holds
 * its chats: the one open now is marked, one at work says so, and archived
 * ones stay out. Opening one goes to it; the project page comes along.
 */
export function ProjectThreads(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly currentThreadId: ThreadId | null;
  readonly query: string;
}) {
  const navigate = useNavigate();
  useNowMinute();
  const refs = useMemo(
    () => [scopeProjectRef(props.environmentId, props.projectId)],
    [props.environmentId, props.projectId],
  );
  const shells = useThreadShellsForProjectRefs(refs);
  const needle = props.query.trim().toLowerCase();
  const threads = useMemo(
    () =>
      shells
        .filter((thread) => thread.archivedAt === null)
        .filter((thread) => needle === "" || thread.title.toLowerCase().includes(needle))
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [shells, needle],
  );

  if (threads.length === 0) {
    return (
      <p className="py-10 text-center text-xs text-muted-foreground">
        {needle !== "" ? "Nothing matches that." : "No threads in this project yet."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col border-t border-border" aria-label="Threads">
      {threads.map((thread) => {
        const current = thread.id === props.currentThreadId;
        const working = threadRuntimeIsActive(thread.runtime);
        return (
          <li key={thread.id} className="border-b border-border">
            <button
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() =>
                void navigate({
                  to: "/$environmentId/$threadId",
                  params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
                })
              }
              className={cn(
                "flex w-full min-w-0 items-center gap-2.5 px-1 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                current && "bg-accent/60",
              )}
            >
              <MessageSquareIcon
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                {thread.title || "New thread"}
              </span>
              <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
                {current
                  ? "Open now"
                  : working
                    ? "Working"
                    : formatRelativeTimeLabel(thread.updatedAt)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
