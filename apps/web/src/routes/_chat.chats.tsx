import { createFileRoute } from "@tanstack/react-router";

import { ChatsPage } from "../components/workbench/ChatPages";
import { validateChatsSearch } from "../components/workbench/chatsSearch";

/**
 * Studio's Chats page: every chat in every project, and in the URL its Needs you filter
 * (`components/workbench/ChatPages.tsx`).
 */
export const Route = createFileRoute("/_chat/chats")({
  validateSearch: validateChatsSearch,
  component: ChatsRouteView,
});

function ChatsRouteView() {
  return <ChatsPage search={Route.useSearch()} />;
}
