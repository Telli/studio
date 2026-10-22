// Packaged app entry. Enables the compile cache before the main bundle loads,
// so the cache also covers main.cjs itself. The Studio app first points itself
// at the bundle it carries (studio/studioAppBundle.ts); others have none.
import * as NodeOS from "node:os";

import { applyStudioAppBundle } from "./studio/studioAppBundle.ts";

applyStudioAppBundle({
  resourcesPath: process.resourcesPath,
  homeDirectory: NodeOS.homedir(),
  env: process.env,
});
require("./compileCache.cjs");
require("./main.cjs");
