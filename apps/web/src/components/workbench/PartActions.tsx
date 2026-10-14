import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronDownIcon } from "lucide-react";
import { useMemo } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { hardwareActions } from "./hardwareActions";

/**
 * Check, Make and Document beside the part's name: the jobs its kind takes
 * that the enabled plugins have skills for. A pick writes the job, naming the
 * file, into the composer.
 */
export function PartActions(props: {
  readonly environmentId: EnvironmentId;
  /** The part as the jobs name it: its file name, or its path in the project. */
  readonly file: string;
  readonly kind: string;
  readonly composerRef: ComposerHandleRef;
}) {
  const list = useEnvironmentQuery(
    pluginEnvironment.list({ environmentId: props.environmentId, input: {} }),
  );
  const groups = useMemo(() => {
    const skills = new Set(
      (list.data?.plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : [])),
    );
    return hardwareActions(props.kind, skills);
  }, [list.data, props.kind]);
  if (groups.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center" data-part-actions="">
      {groups.map(({ group, actions }) => (
        <Menu key={group}>
          <MenuTrigger render={<Button variant="ghost-muted" size="xs" />}>
            {group}
            <ChevronDownIcon className="size-3 opacity-60" aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup align="end" side="top">
            {actions.map((action) => (
              <MenuItem
                key={action.id}
                onClick={() => {
                  const composer = props.composerRef.current;
                  if (!composer) return;
                  composer.insertTextAtEnd(action.prompt(props.file), {
                    ensureLeadingBoundary: true,
                  });
                  composer.focusAtEnd();
                }}
              >
                {action.label}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      ))}
    </div>
  );
}
