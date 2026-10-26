import type { InstalledPlugin } from "@t3tools/contracts";

/**
 * Whether something New or the library offers can be made now. When it can't, it names the
 * skill it needs and the plugin that lists that skill, and says whether that plugin is installed
 * (the skill is turned off) or not (it is not installed).
 *
 * New's templates (`newTemplates.ts`) and the library (`libraryCatalog.ts`) both say it this way.
 * This module imports neither, so New can use it without importing the library.
 */
export type Availability =
  | { readonly on: true }
  | {
      readonly on: false;
      readonly skill: string;
      readonly plugin: string;
      readonly installed: boolean;
    };

/** The plugin Studio's own skills come from. */
export const TEXT_TO_CAD = "text-to-cad";

/** New's templates that no plugin ships the skill for: New and the library leave them out. */
export const UNLISTED_TEMPLATES: ReadonlyArray<string> = ["harness"];

/**
 * A skill no enabled plugin has, named with the first installed plugin that lists it, or with
 * text-to-cad when none does.
 */
export function missingSkill(skill: string, plugins: ReadonlyArray<InstalledPlugin>) {
  const lister = plugins.find((plugin) => plugin.skills.includes(skill));
  return {
    on: false,
    skill,
    plugin: lister?.id ?? TEXT_TO_CAD,
    installed: lister !== undefined,
  } as const;
}
