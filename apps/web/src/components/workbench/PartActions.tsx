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
import { MENU_ICONS } from "./kinds";
import { handToChat, useNewDialogStore } from "./NewDialog";

/** New on Documents (the toolbar's, `StudioNew`): a PRD, requirements, an FMEA, your own. */
function newDocument() {
  useNewDialogStore.getState().ask("Documents");
}

/**
 * Evaluate, Manufacture and Document for the part, each marked with the icon of what its jobs make
 * (`kinds.ts`): the jobs its kind takes that the enabled plugins have skills for, the everyday ones
 * in titled sections (Manufacture leading with the project's own way of making it), then one
 * "More" that opens the quick find (⌘K, `StudioQuickFind`) on all of the menu's jobs, the long
 * tail too; Document also starts a document from a template (`NewDialog`). A pick sends the job to
 * the chat, naming the part by a link to its file, as New's Create does: its prompt asks for what
 * it needs (the loads, the machine), so nothing waits on a second press.
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
  const write = (action: HardwareAction) =>
    handToChat(props.composerRef, action.prompt(props.file));
  const item = (action: HardwareAction) => (
    <MenuItem key={action.id} onClick={() => write(action)}>
      {action.label}
    </MenuItem>
  );

  return (
    <div className="flex shrink-0 items-center" data-part-actions="">
      {groups.map((menu) => {
        const Icon = MENU_ICONS[menu.group];
        return (
          <Menu key={menu.group}>
            <MenuTrigger
              aria-label={menu.group}
              title={menu.group}
              render={
                props.inTopBar ? (
                  <Button variant="ghost" size="sm" />
                ) : (
                  <Button variant="ghost-muted" size="xs" />
                )
              }
            >
              <Icon aria-hidden="true" />
              {/* On a narrow panel the toolbar shows each menu as its icon, nothing cut off. */}
              <span className={props.inTopBar ? "@max-[40rem]/toolbar:hidden" : undefined}>
                {menu.group}
              </span>
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
              {menu.group === "Document" ? (
                <>
                  <MenuSeparator />
                  <MenuItem onClick={newDocument}>New document…</MenuItem>
                </>
              ) : null}
              {menu.others.length === 0 ? null : (
                <>
                  {menu.sections.length === 0 && menu.group !== "Document" ? null : (
                    <MenuSeparator />
                  )}
                  <MenuItem onClick={() => openCommandPalette({ query: menu.group })}>
                    {menu.moreLabel}…
                    {findShortcut ? <MenuShortcut>{findShortcut}</MenuShortcut> : null}
                  </MenuItem>
                </>
              )}
            </MenuPopup>
          </Menu>
        );
      })}
    </div>
  );
}
