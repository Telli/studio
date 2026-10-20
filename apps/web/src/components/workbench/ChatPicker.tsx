import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";

import { useComposerHandleContext } from "~/composerHandleContext";
import { useNowMinute } from "~/hooks/useNowMinute";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { buildThreadRouteParams } from "~/threadRoutes";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { folderProject, useEnvironmentFolders } from "./useProjectFolders";
import { usePendingStart } from "./usePendingStart";
import { useStudioProjectAt } from "./useStudioProjects";
import { chatLabel, projectChats } from "./workspaceTitle";

/**
 * The top of a project workspace's chat: which of the project's chats this is, a pick of the
 * others (every folder of the project, newest first), and New chat. Every chat belongs to a
 * project; there is no list of chats apart from one. A new project's first message, from Home,
 * is sent from here (`usePendingStart`).
 */
export function ChatPicker(props: {
  readonly environmentId: EnvironmentId;
  readonly project: EnvironmentProject | null;
  readonly threadId: ThreadId;
  /** A chat not started yet (a draft): it has no place in the list until its first message. */
  readonly draft: boolean;
  readonly onNewChat: () => void;
}) {
  const { environmentId, project } = props;
  const folder = project?.workspaceRoot ?? null;
  usePendingStart(useComposerHandleContext(), folder, props.draft);
  const navigate = useNavigate();
  useNowMinute();
  const studio = useStudioProjectAt(environmentId, folder);
  const knownFolders = useEnvironmentFolders(environmentId);
  const refs = useMemo(() => {
    const records =
      studio === null
        ? project === null
          ? []
          : [project]
        : studio.project.folders.flatMap((path) => folderProject(knownFolders, path) ?? []);
    return records.map((record) => scopeProjectRef(environmentId, record.id));
  }, [studio, project, knownFolders, environmentId]);
  const chats = projectChats(useThreadShellsForProjectRefs(refs));
  const current = props.draft ? null : (chats.find((chat) => chat.id === props.threadId) ?? null);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <Select
        value={current?.id ?? ""}
        onValueChange={(id) => {
          const chat = chats.find((entry) => entry.id === id);
          if (chat === undefined || chat.id === props.threadId) return;
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(scopeThreadRef(chat.environmentId, chat.id)),
          });
        }}
      >
        <SelectTrigger size="sm" aria-label="Chats in this project">
          <SelectValue>{current === null ? "New chat" : chatLabel(current.title)}</SelectValue>
        </SelectTrigger>
        <SelectPopup alignItemWithTrigger={false}>
          {chats.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No chats yet</div>
          ) : (
            chats.map((chat) => (
              <SelectItem key={chat.id} hideIndicator value={chat.id}>
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate">{chatLabel(chat.title)}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
                    {formatRelativeTimeLabel(chat.updatedAt)}
                  </span>
                </span>
              </SelectItem>
            ))
          )}
        </SelectPopup>
      </Select>
      <div className="flex-1" />
      <Button variant="ghost" size="sm" onClick={props.onNewChat}>
        <PlusIcon />
        New chat
      </Button>
    </div>
  );
}
