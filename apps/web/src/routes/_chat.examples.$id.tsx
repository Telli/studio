import { createFileRoute } from "@tanstack/react-router";

import { ExampleDetail } from "../components/workbench/examples/ExampleDetail";
import { validateExampleSearch } from "../components/workbench/examples/examples";

/**
 * An example's page, view only, with Make a copy to edit, and in the URL the file its copy opens on
 * (`components/workbench/examples/ExampleDetail.tsx`).
 */
export const Route = createFileRoute("/_chat/examples/$id")({
  validateSearch: validateExampleSearch,
  component: ExampleRouteView,
});

function ExampleRouteView() {
  const { id } = Route.useParams();
  const { file } = Route.useSearch();
  return <ExampleDetail key={id} sampleId={id} file={file} />;
}
