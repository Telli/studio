import { createFileRoute } from "@tanstack/react-router";

import { NeedsYouPage } from "../components/workbench/ChatPages";

/** Studio's Needs you page: the chats waiting on the person (`components/workbench/ChatPages.tsx`). */
export const Route = createFileRoute("/_chat/needs-you")({
  component: NeedsYouPage,
});
