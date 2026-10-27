import { createFileRoute, redirect } from "@tanstack/react-router";

/** Examples are the top of the Library now; the old address lands there, so links and history still work. */
export const Route = createFileRoute("/_chat/examples/")({
  beforeLoad: () => {
    throw redirect({ to: "/library", replace: true });
  },
});
