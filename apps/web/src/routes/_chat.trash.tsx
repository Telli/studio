import { createFileRoute } from "@tanstack/react-router";

import { TrashPage } from "../components/workbench/trash/TrashPage";

/** Studio's Trash: projects moved there, to restore or delete forever (`components/workbench/trash/`). */
export const Route = createFileRoute("/_chat/trash")({
  component: TrashPage,
});
