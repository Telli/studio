import type { EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { InlineButton } from "../../ui/button";
import type { LibrarySkill } from "./libraryCatalog";
import { libraryHref } from "./librarySearch";

/**
 * One installed plugin's skills, listed under its row in Settings › Plugins in the engineering
 * interface: each with its name, its description and In the Toolbox, a link to its entry. A
 * skill is named as the library names it (`skillLabel`: `skillName` among every installed
 * plugin's skills). The library reads the primary environment's plugins, so a skill listed for
 * another environment has no link.
 */
export function PluginSkills(props: {
  /** This plugin's skills (`librarySkills`). */
  readonly skills: ReadonlyArray<LibrarySkill>;
  readonly skillLabel: (name: string) => string;
  /** The environment whose plugin these skills belong to. */
  readonly environmentId: EnvironmentId;
}) {
  const inLibrary = usePrimaryEnvironmentId() === props.environmentId;
  return (
    <ul role="list" className="pt-3 pb-2 text-xs">
      {props.skills.map((skill) => {
        const name = props.skillLabel(skill.name);
        return (
          <li
            key={skill.id}
            className="flex min-w-0 items-baseline justify-between gap-3 border-t border-border/50 py-2"
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground">{name}</p>
              {skill.description === "" ? null : (
                <p className="max-w-xl leading-normal text-muted-foreground">{skill.description}</p>
              )}
            </div>
            {inLibrary ? (
              <InlineButton
                tone="muted"
                aria-label={`${name} in the Toolbox`}
                render={<Link {...libraryHref({ entry: skill.id })} />}
              >
                In the Toolbox
              </InlineButton>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
