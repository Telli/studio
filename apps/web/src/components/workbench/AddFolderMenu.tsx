import type { EnvironmentId } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { CommandIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon } from "lucide-react";

import { openCommandPalette } from "~/commandPaletteBus";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { useEnvironmentFolders, usePickFolder } from "./useProjectFolders";

/**
 * Adds a folder to a project: one the app already knows, one picked on this
 * computer, or (elsewhere) one added from the command palette first.
 */
export function AddFolderMenu(props: {
  readonly environmentId: EnvironmentId;
  /** Folders already in the project, left out of the list. */
  readonly exclude: ReadonlyArray<string>;
  readonly onAdd: (folder: string) => void;
}) {
  const folders = useEnvironmentFolders(props.environmentId);
  const pick = usePickFolder(props.environmentId);
  const excluded = new Set(props.exclude.map(studioFolderKey));
  const offered = folders
    .filter((project) => !excluded.has(studioFolderKey(project.workspaceRoot)))
    .toSorted((a, b) => a.title.localeCompare(b.title));

  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="sm" />}>
        <FolderPlusIcon />
        Add a folder
      </MenuTrigger>
      <MenuPopup align="start" side="bottom" sideOffset={6} className="max-h-80">
        {offered.length === 0 ? null : (
          <MenuGroup>
            <MenuGroupLabel>Folders in Studio</MenuGroupLabel>
            {offered.map((project) => (
              <MenuItem key={project.id} onClick={() => props.onAdd(project.workspaceRoot)}>
                <FolderIcon />
                <span className="min-w-0 truncate">{project.title}</span>
              </MenuItem>
            ))}
          </MenuGroup>
        )}
        {offered.length === 0 ? null : <MenuSeparator />}
        {pick === null ? (
          <MenuItem onClick={() => openCommandPalette({ open: "add-project" })}>
            <CommandIcon />
            Add a folder to Studio first
          </MenuItem>
        ) : (
          <MenuItem
            onClick={() =>
              void pick().then((folder) => {
                if (folder !== null) props.onAdd(folder);
              })
            }
          >
            <FolderOpenIcon />
            Choose a folder...
          </MenuItem>
        )}
      </MenuPopup>
    </Menu>
  );
}
