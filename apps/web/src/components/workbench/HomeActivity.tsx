import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";

import { cn } from "~/lib/utils";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { buildThreadRouteParams } from "~/threadRoutes";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { FileKindIcon } from "./FileKindIcon";
import { homeRecent, needsYou } from "./recentActivity";
import { CHAT_ICON, KIND_TINTS } from "./kinds";
import { useOpenedThreads } from "./openedThreads";
import { partLabel } from "./partNames";
import type { ListedProject } from "./projectList";
import { useRecentFiles } from "./recentFiles";
import { openInPanel } from "./useOpenInWorkbench";
import { chatLabel } from "./workspaceTitle";

const LABEL = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";
const ROW =
  "flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent";

const ChatMark = () => (
  <CHAT_ICON className={cn("size-4 shrink-0", KIND_TINTS.Chats)} aria-hidden="true" />
);

function Row(props: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly detail: string;
  readonly tone?: string;
  readonly onOpen: () => void;
}) {
  return (
    <button type="button" className={ROW} onClick={props.onOpen}>
      {props.icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-foreground">{props.title}</span>
        <span className={cn("truncate text-xs text-muted-foreground", props.tone)}>
          {props.detail}
        </span>
      </span>
    </button>
  );
}

/**
 * Home's activity, under its start box: the chats waiting on the person in any project (a
 * question, an approval), and what was opened lately, chats and files across every project, as
 * Google Drive's Recent lists it (`homeActivity.ts`). A chat opens in its workspace; a file opens
 * beside the chat it was opened with.
 */
export function HomeActivity(props: {
  readonly environmentId: EnvironmentId;
  readonly cards: ReadonlyArray<ListedProject>;
}) {
  const opened = useOpenedThreads();
  const files = useRecentFiles();
  const recent = useMemo(
    () => homeRecent(props.cards, opened, files),
    [files, opened, props.cards],
  );
  const waiting = useMemo(() => needsYou(props.cards), [props.cards]);
  const plugins = useEnvironmentQuery(
    pluginEnvironment.list({ environmentId: props.environmentId, input: {} }),
  ).data?.plugins;
  const navigate = useNavigate();
  const openChat = (thread: EnvironmentThreadShell) =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
    });
  if (recent.length === 0 && waiting.length === 0) return null;

  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-2">
      {waiting.length === 0 ? null : (
        <section aria-label="Needs you" className="flex min-w-0 flex-col gap-1">
          <h2 className={LABEL}>Needs you</h2>
          {waiting.slice(0, 6).map(({ card, thread }) => (
            <Row
              key={thread.id}
              icon={<ChatMark />}
              title={chatLabel(thread.title)}
              detail={`${card.project.name} · waiting on you`}
              tone="text-warning-foreground"
              onOpen={() => openChat(thread)}
            />
          ))}
        </section>
      )}
      {recent.length === 0 ? null : (
        <section aria-label="Recent" className="flex min-w-0 flex-col gap-1">
          <h2 className={LABEL}>Recent</h2>
          {recent.map((item) =>
            item.kind === "chat" ? (
              <Row
                key={`chat:${item.thread.id}`}
                icon={<ChatMark />}
                title={chatLabel(item.thread.title)}
                detail={`${item.card.project.name} · ${formatRelativeTimeLabel(item.at)}`}
                onOpen={() => openChat(item.thread)}
              />
            ) : (
              <Row
                key={`file:${item.thread.id}:${item.file.path}`}
                icon={<FileKindIcon path={item.file.path} className="size-4" />}
                title={partLabel(item.file.path.split(/[\\/]/).pop() ?? item.file.path)}
                detail={`${item.card.project.name} · ${formatRelativeTimeLabel(item.at)}`}
                onOpen={() => {
                  openInPanel(
                    plugins,
                    scopeThreadRef(item.thread.environmentId, item.thread.id),
                    item.file.path,
                  );
                  openChat(item.thread);
                }}
              />
            ),
          )}
        </section>
      )}
    </div>
  );
}
