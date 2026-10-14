import { createFileRoute } from "@tanstack/react-router";

import { ProjectsHome } from "../components/workbench/ProjectsHome";

/** Studio's Projects page: every project, and New project (`components/workbench/ProjectsHome.tsx`). */
export const Route = createFileRoute("/_chat/projects")({
  component: ProjectsHome,
});
