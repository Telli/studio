import { createFileRoute, redirect } from "@tanstack/react-router";

import { validateExampleSearch } from "../components/workbench/examples/examples";

/** An example's page lives under the Library now; the old address lands there, with its file. */
export const Route = createFileRoute("/_chat/examples/$id")({
  validateSearch: validateExampleSearch,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/library/examples/$id",
      params: { id: params.id },
      search: search.file === undefined ? {} : { file: search.file },
      replace: true,
    });
  },
});
