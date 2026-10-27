import { createFileRoute } from "@tanstack/react-router";

import { ExamplesPage } from "../components/workbench/examples/ExamplesPage";

/** Studio's Examples, the finished projects it ships (`components/workbench/examples/`). */
export const Route = createFileRoute("/_chat/examples/")({
  component: ExamplesPage,
});
