import { createFileRoute } from "@tanstack/react-router";

import { StudioInterfaceSettingsPanel } from "../components/workbench/StudioInterfaceSetting";

export const Route = createFileRoute("/settings/interface")({
  component: StudioInterfaceSettingsPanel,
});
