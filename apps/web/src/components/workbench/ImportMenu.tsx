import { DownloadIcon } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";

/**
 * Studio's one Import menu: Files or a folder, and Scan this computer, with the same items and
 * names on Home's start page, Home's projects, the Projects page and the workspace toolbar. The
 * button is the outline Import by default; the start page passes its big card as `trigger`.
 * Inside a toolbar container a narrow row shows the icon alone.
 */
export function ImportMenu(props: {
  readonly actions: { readonly scan: () => void; readonly pick: () => Promise<void> };
  readonly trigger?: ReactElement;
}) {
  const items = (
    <MenuPopup align="end" side="bottom" sideOffset={6}>
      <MenuItem onClick={() => void props.actions.pick()}>Files or a folder</MenuItem>
      <MenuItem onClick={props.actions.scan}>Scan this computer</MenuItem>
    </MenuPopup>
  );
  return props.trigger === undefined ? (
    <Menu>
      <MenuTrigger
        render={<Button variant="outline" size="sm" aria-label="Import" title="Import" />}
      >
        <DownloadIcon aria-hidden="true" />
        <span className="@max-[40rem]/toolbar:hidden">Import</span>
      </MenuTrigger>
      {items}
    </Menu>
  ) : (
    <Menu>
      <MenuTrigger render={props.trigger} />
      {items}
    </Menu>
  );
}
