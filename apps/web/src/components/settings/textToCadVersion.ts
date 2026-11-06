import type { InstalledPlugin } from "@t3tools/contracts";

import { TEXT_TO_CAD } from "../workbench/library/skillAvailability";

/** The original project's own site, which About links to. */
export const TEXT_TO_CAD_SITE = "https://www.texttocad.dev";

/** The text-to-cad this Studio carries, as its plugin names it; null where it names none. */
export function textToCadVersion(
  plugins: ReadonlyArray<Pick<InstalledPlugin, "id" | "version">>,
): string | null {
  return plugins.find((plugin) => plugin.id === TEXT_TO_CAD)?.version ?? null;
}
