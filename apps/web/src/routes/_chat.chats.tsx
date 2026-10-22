import { createFileRoute } from "@tanstack/react-router";

import { ChatsPage } from "../components/workbench/ChatPages";

/** Studio's Chats page: every chat in every project (`components/workbench/ChatPages.tsx`). */
export const Route = createFileRoute("/_chat/chats")({
  component: ChatsPage,
});
