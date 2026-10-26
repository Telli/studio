import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { type ReactNode, useMemo, useState } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { Input } from "../ui/input";
import { SidebarInset } from "../ui/sidebar";
import { findChats, useAllChats } from "./allChats";
import { chatStanding } from "./chatStanding";
import { CHAT_ICON } from "./kinds";
import { needsYou } from "./recentActivity";
import { StudioTopBar } from "./StudioTopBar";
import { useOpenChat } from "./useOpenChat";
import { useProjectList } from "./useProjectList";
import { chatLabel, workspaceTitle } from "./workspaceTitle";

/**
 * A page of Studio beside the rail, as the Projects page is laid out: its top bar, then a column.
 * Chats, Needs you and the Library (`LibraryPage`) are each one.
 */
export function ChatPage(props: {
  readonly title: string;
  readonly count: number;
  readonly lede?: string;
  readonly search?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <StudioTopBar>
          {props.search === undefined ? null : (
            <div className="w-full max-w-72">{props.search}</div>
          )}
        </StudioTopBar>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
          <div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-6">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold text-foreground">
                {props.title}{" "}
                <span className="text-base font-normal text-muted-foreground tabular-nums">
                  {props.count}
                </span>
              </h1>
              {props.lede === undefined ? null : (
                <p className="text-sm text-muted-foreground">{props.lede}</p>
              )}
            </div>
            {props.children}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

/** Chats as a page lists them: each with its project and how it stands, the newest first. */
function ChatList(props: {
  readonly chats: ReadonlyArray<EnvironmentThreadShell>;
  readonly projectOf: ReadonlyMap<string, string>;
  readonly empty: string;
}) {
  const openChat = useOpenChat();
  useNowMinute();
  if (props.chats.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{props.empty}</p>;
  }
  return (
    <ul className="flex min-w-0 flex-col border-t border-border">
      {props.chats.map((chat) => {
        const state = chatStanding(chat);
        const project = props.projectOf.get(chat.id);
        return (
          <li key={chat.id} className="border-b border-border">
            <button
              type="button"
              onClick={() => openChat(chat)}
              className="flex w-full min-w-0 items-center gap-3 px-1 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <CHAT_ICON className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-foreground">{chatLabel(chat.title)}</span>
                {project === undefined ? null : (
                  <span className="truncate text-xs text-muted-foreground">{project}</span>
                )}
              </span>
              <span className={cn("shrink-0 text-xs tabular-nums", state.tone)}>{state.text}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ChatsPageContent(props: { readonly environmentId: EnvironmentId }) {
  const everyChat = useAllChats(props.environmentId);
  const [query, setQuery] = useState("");
  const shown = findChats(everyChat.chats, everyChat.projectOf, query);
  return (
    <ChatPage
      title="Chats"
      count={everyChat.chats.length}
      search={
        <Input
          type="search"
          size="sm"
          placeholder="Search chats"
          aria-label="Search chats"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      }
    >
      <ChatList
        chats={shown}
        projectOf={everyChat.projectOf}
        empty={
          everyChat.chats.length === 0
            ? "No chats yet. A project's first chat starts with it."
            : "No chat matches that."
        }
      />
    </ChatPage>
  );
}

/**
 * Studio's Chats page (the rail's Chats): every chat in every project, the newest first, each with
 * its project's name and how it stands, and a box to find one by its name or its project's.
 */
export function ChatsPage() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <ChatsPageContent environmentId={environmentId} />;
}

function NeedsYouPageContent(props: { readonly environmentId: EnvironmentId }) {
  const { cards } = useProjectList(props.environmentId);
  const waiting = useMemo(() => {
    const projectOf = new Map<string, string>();
    const chats = needsYou(cards).map(({ card, thread }) => {
      projectOf.set(
        thread.id,
        workspaceTitle(card.project.name, card.folder?.workspaceRoot ?? null),
      );
      return thread;
    });
    return { chats, projectOf };
  }, [cards]);
  return (
    <ChatPage
      title="Needs you"
      count={waiting.chats.length}
      lede="The chats waiting on your answer or your approval, in every project."
    >
      <ChatList
        chats={waiting.chats}
        projectOf={waiting.projectOf}
        empty="Nothing is waiting on you. When a chat asks a question or needs an approval, it shows here."
      />
    </ChatPage>
  );
}

/**
 * Studio's Needs you page (the rail's Needs you, with how many): the chats waiting on the person,
 * a question or an approval, in any project, the newest first. Opening one goes to it.
 */
export function NeedsYouPage() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <NeedsYouPageContent environmentId={environmentId} />;
}
