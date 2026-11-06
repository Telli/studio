import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { EllipsisIcon } from "lucide-react";
import { useState } from "react";

import { useThreadActions } from "~/hooks/useThreadActions";
import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { chatStanding } from "./chatStanding";
import { chatLabel } from "./workspaceTitle";

type ChatMenuChoice = "rename" | "delete";

/**
 * Chats down the sidebar (`StudioSidebar`), each with how it stands (`chatStanding`),
 * and the two things a chat app lets you do to one: Rename it where it is (its name becomes a box;
 * Enter or clicking away keeps the new name, Escape the old) and Delete it, after asking. Both
 * are a right-click away, or the "…" that shows on a row's hover in place of its time. The
 * actions are T3 Code's own (`updateMetadata`, `useThreadActions().deleteThread`, which moves to
 * another chat when the open one goes); Archive is left out, as Studio has no archive to come back
 * from.
 */
export function ChatRows(props: {
  readonly chats: ReadonlyArray<EnvironmentThreadShell>;
  readonly currentId: string | null;
  readonly onOpen: (chat: EnvironmentThreadShell, current: boolean) => void;
}) {
  const { deleteThread } = useThreadActions();
  const updateMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: true,
  });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<EnvironmentThreadShell | null>(null);

  const showMenu = async (chat: EnvironmentThreadShell, position: { x: number; y: number }) => {
    const api = readLocalApi();
    if (!api) return;
    const choice = await api.contextMenu.show<ChatMenuChoice>(
      [
        { id: "rename", label: "Rename" },
        { id: "delete", label: "Delete…", destructive: true },
      ],
      position,
    );
    if (choice === "rename") setRenaming(chat.id);
    else if (choice === "delete") setDeleting(chat);
  };
  const rename = (chat: EnvironmentThreadShell, typed: string) => {
    setRenaming(null);
    const title = typed.trim();
    if (title === "" || title === chat.title.trim()) return;
    void updateMetadata({
      environmentId: chat.environmentId,
      input: { threadId: chat.id, title },
    });
  };
  const remove = () => {
    const chat = deleting;
    setDeleting(null);
    if (chat !== null) void deleteThread(scopeThreadRef(chat.environmentId, chat.id));
  };

  return (
    <>
      <SidebarMenu>
        {props.chats.map((chat) => {
          const current = chat.id === props.currentId;
          const state = chatStanding(chat);
          return (
            <SidebarMenuItem key={chat.id} className="group/chat relative">
              {renaming === chat.id ? (
                <input
                  aria-label="Chat name"
                  defaultValue={chatLabel(chat.title)}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onBlur={(event) => rename(chat, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    else if (event.key === "Escape") setRenaming(null);
                  }}
                  className="h-8 w-full min-w-0 rounded-md bg-background px-2 text-sm text-foreground outline-none ring-1 ring-ring ring-inset"
                />
              ) : (
                <>
                  <SidebarMenuButton
                    isActive={current}
                    aria-current={current ? "page" : undefined}
                    onClick={() => props.onOpen(chat, current)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void showMenu(chat, { x: event.clientX, y: event.clientY });
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{chatLabel(chat.title)}</span>
                    <span
                      className={cn(
                        "shrink-0 text-2xs font-normal tabular-nums group-hover/chat:invisible group-focus-within/chat:invisible",
                        state.tone,
                      )}
                    >
                      {state.text}
                    </span>
                  </SidebarMenuButton>
                  <button
                    type="button"
                    aria-label={`More for ${chatLabel(chat.title)}`}
                    onClick={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      void showMenu(chat, { x: box.left, y: box.bottom });
                    }}
                    className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset group-hover/chat:opacity-100"
                  >
                    <EllipsisIcon className="size-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleting === null ? "this chat" : chatLabel(deleting.title)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its messages go for good. The project's files, and what the chat made, stay as they
              are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
