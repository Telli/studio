import { createFileRoute } from "@tanstack/react-router";

import { LibraryPage } from "../components/workbench/library/LibraryPage";
import { validateLibrarySearch } from "../components/workbench/library/librarySearch";

/**
 * Studio's Library: every document type and skill, each with its example, and in the URL the entry
 * whose detail is open, the group it opens on and where it was opened from
 * (`components/workbench/library/LibraryPage.tsx`).
 */
export const Route = createFileRoute("/_chat/library")({
  validateSearch: validateLibrarySearch,
  component: LibraryRouteView,
});

function LibraryRouteView() {
  return <LibraryPage search={Route.useSearch()} />;
}
