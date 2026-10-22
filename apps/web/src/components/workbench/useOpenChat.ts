import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useNavigate } from "@tanstack/react-router";

import { buildThreadRouteParams } from "~/threadRoutes";
import { showChat } from "./overviewPanel";

/**
 * Opens a chat from a list (the sidebar's, Chats, Needs you): it shows beside its panel
 * (`showChat`), in its own project's workspace. The one already open only comes forward.
 */
export function useOpenChat() {
  const navigate = useNavigate();
  return (chat: EnvironmentThreadShell, current = false) => {
    const ref = scopeThreadRef(chat.environmentId, chat.id);
    showChat(ref);
    if (current) return;
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };
}
