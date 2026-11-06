import * as Config from "effect/Config";

import packageJson from "../package.json" with { type: "json" };

/**
 * The version this app is, as usage counts and clients are told it: what a packaged Studio says
 * (`T3CODE_APP_VERSION`, from `studio.json`, on Mac and Windows alike), else the server package's.
 * What T3 Code's own compatibility checks compare stays `packageJson.version`.
 */
export const appVersion = Config.String("T3CODE_APP_VERSION").pipe(
  Config.withDefault(packageJson.version),
);
