import { createStudioProjectsEnvironmentAtoms } from "@t3tools/client-runtime/state/studioProjects";

import { connectionAtomRuntime } from "../connection/runtime";

export const studioProjectsEnvironment =
  createStudioProjectsEnvironmentAtoms(connectionAtomRuntime);
