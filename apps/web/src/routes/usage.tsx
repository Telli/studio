import { createFileRoute, redirect } from "@tanstack/react-router";

import { UsagePage } from "../components/usage/UsagePage";
import { isEngineeringInterface } from "../components/workbench/studioInterface";

export const Route = createFileRoute("/usage")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
    // The engineering interface has no usage page: an old link or history entry lands on Home.
    // The code interfaces keep it.
    if (isEngineeringInterface()) throw redirect({ to: "/", replace: true });
  },
  component: UsagePage,
});
