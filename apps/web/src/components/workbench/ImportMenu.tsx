import { DownloadIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";

/** Import, at the corner of a list of projects: files or a folder, or another scan of this computer. */
export function ImportMenu(props: {
  readonly actions: { readonly scan: () => void; readonly pick: () => Promise<void> };
}) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="sm" />}>
        <DownloadIcon />
        Import
      </MenuTrigger>
      <MenuPopup align="end" side="bottom" sideOffset={6}>
        <MenuItem onClick={() => void props.actions.pick()}>Files or a folder</MenuItem>
        <MenuItem onClick={props.actions.scan}>Scan this computer</MenuItem>
      </MenuPopup>
    </Menu>
  );
}
