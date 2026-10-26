import type { InstalledPlugin } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";
import { InlineButton } from "../../ui/button";
import { librarySkills, skillName } from "./libraryCatalog";
import type { Availability } from "./skillAvailability";

/** Settings › Plugins, where a plugin is turned on or installed. */
export function PluginsLink() {
  return <InlineButton render={<Link to="/settings/plugins" />}>Settings › Plugins</InlineButton>;
}

/**
 * Why something can't be made now, in the words New and the library both say it: the skill it
 * needs by its one name (`skillName`), the plugin that lists it, and whether that plugin is turned
 * off or not installed, then the way to Settings › Plugins.
 */
export function NeedsSkill({
  needs,
  plugins,
  className,
  ...props
}: Omit<ComponentProps<"p">, "children"> & {
  readonly needs: Extract<Availability, { on: false }>;
  /** The installed plugins, which name the skill and its plugin. */
  readonly plugins: ReadonlyArray<InstalledPlugin>;
}) {
  const plugin =
    plugins.find((candidate) => candidate.id === needs.plugin)?.displayName ?? needs.plugin;
  return (
    <p className={cn("text-sm text-foreground", className)} {...props}>
      Needs the {skillName(needs.skill, librarySkills(plugins))} skill, from the {plugin} plugin,
      which is {needs.installed ? "turned off" : "not installed"}. <PluginsLink />
    </p>
  );
}
