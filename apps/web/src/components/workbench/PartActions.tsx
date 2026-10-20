import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronDownIcon } from "lucide-react";
import { Fragment, useMemo } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import type { ComposerHandleRef } from "~/composerHandleContext";
import { shortcutLabelForCommand } from "~/keybindings";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "../ui/menu";
import { type HardwareAction, hardwareActions } from "./hardwareActions";

/**
 * Evaluate, Manufacture and Document for the part: the jobs its kind takes that the enabled
 * plugins have skills for, the everyday ones in titled sections (Manufacture leading with the
 * project's own way of making it), then one "More" that opens the quick find (⌘K,
 * `StudioQuickFind`) on all of the menu's jobs, the long tail too. A pick writes the job, naming
 * the part by a link to its file, into the composer.
 */
export function PartActions(props: {
  readonly environmentId: EnvironmentId;
  /** The part as the jobs name it: a link to its file, which the composer shows as the part. */
  readonly file: string;
  readonly kind: string;
  /** How the project's parts are made, from its setup; unset or "Not decided" offers every way. */
  readonly process?: string | undefined;
  readonly composerRef: ComposerHandleRef;
  /** In the workspace's top bar: its buttons, menus opening below. Else small, opening above. */
  readonly inTopBar?: boolean;
}) {
  const list = useEnvironmentQuery(
    pluginEnvironment.list({ environmentId: props.environmentId, input: {} }),
  );
  const groups = useMemo(() => {
    const skills = new Set(
      (list.data?.plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : [])),
    );
    return hardwareActions(props.kind, skills, props.process);
  }, [list.data, props.kind, props.process]);
  const findShortcut = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "commandPalette.toggle",
  );
  if (groups.length === 0) return null;
  const write = (action: HardwareAction) => {
    const composer = props.composerRef.current;
    if (!composer) return;
    composer.insertTextAtEnd(action.prompt(props.file), { ensureLeadingBoundary: true });
    composer.focusAtEnd();
  };
  const item = (action: HardwareAction) => (
    <MenuItem key={action.id} onClick={() => write(action)}>
      {action.label}
    </MenuItem>
  );

  return (
    <div className="flex shrink-0 items-center" data-part-actions="">
      {groups.map((menu) => (
        <Menu key={menu.group}>
          <MenuTrigger
            render={
              props.inTopBar ? (
                <Button variant="ghost" size="sm" />
              ) : (
                <Button variant="ghost-muted" size="xs" />
              )
            }
          >
            {menu.group}
            <ChevronDownIcon className="size-3 opacity-60" aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup
            align="end"
            side={props.inTopBar ? "bottom" : "top"}
            sideOffset={props.inTopBar ? 6 : 4}
          >
            {menu.sections.map((section, index) => (
              <Fragment key={section.title}>
                {index === 0 ? null : <MenuSeparator />}
                <MenuGroup>
                  <MenuGroupLabel>{section.title}</MenuGroupLabel>
                  {section.actions.map(item)}
                </MenuGroup>
              </Fragment>
            ))}
            {menu.others.length === 0 ? null : (
              <>
                {menu.sections.length === 0 ? null : <MenuSeparator />}
                <MenuItem onClick={() => openCommandPalette({ query: menu.group })}>
                  {menu.moreLabel}…
                  {findShortcut ? <MenuShortcut>{findShortcut}</MenuShortcut> : null}
                </MenuItem>
              </>
            )}
          </MenuPopup>
        </Menu>
      ))}
    </div>
  );
}
