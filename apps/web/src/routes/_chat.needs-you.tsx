import { createFileRoute, redirect } from "@tanstack/react-router";

/** Needs you is a filter on Chats now; the old address lands there, so links and history still work. */
export const Route = createFileRoute("/_chat/needs-you")({
  beforeLoad: () => {
    throw redirect({ to: "/chats", search: { filter: "needs-you" }, replace: true });
  },
});
