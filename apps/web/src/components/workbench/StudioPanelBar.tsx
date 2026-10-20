import { DownloadIcon } from "lucide-react";
import { useEffect } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { useWorkspaceMode, useWorkspaceModeStore } from "./workspaceMode";

/** What Export offers, each written into the composer as a job for the part on screen. */
const EXPORTS = [
  { label: "STEP", prompt: "Export the part on screen as STEP." },
  { label: "STL and 3MF", prompt: "Export the part on screen as STL and 3MF." },
  {
    label: "Drawing as PDF",
    prompt: "Make an engineering drawing of the part on screen as a PDF.",
  },
  { label: "DXF for cutting", prompt: "Make a cut-ready DXF of the part on screen." },
] as const;

/**
 * The rest of a project workspace's top bar, in the panel's title row (the chat's row carries
 * `StudioWorkspaceBar`): Ask or Edit by hand for the part on screen, and Export. The mode is the
 * project's (`workspaceMode.ts`); the CAD views take it from the host context.
 */
export function StudioPanelBar(props: {
  readonly folder: string | null;
  readonly composerRef: ComposerHandleRef | null;
}) {
  const { folder } = props;
  const mode = useWorkspaceMode(folder);
  const setMode = useWorkspaceModeStore((store) => store.setMode);
  const setActiveFolder = useWorkspaceModeStore((store) => store.setActiveFolder);
  useEffect(() => {
    setActiveFolder(folder);
  }, [folder, setActiveFolder]);

  const exportJob = (prompt: string) => {
    const composer = props.composerRef?.current ?? null;
    if (composer === null) return;
    composer.insertTextAtEnd(prompt, { ensureLeadingBoundary: true });
    composer.focusAtEnd();
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex min-w-0 flex-1 justify-center">
        <ToggleGroup
          aria-label="How to change the part"
          value={[mode]}
          onValueChange={(next) => {
            const value = next[0];
            if (folder !== null && (value === "ask" || value === "manual")) setMode(folder, value);
          }}
        >
          <Toggle value="ask">Ask</Toggle>
          <Toggle value="manual">Edit by hand</Toggle>
        </ToggleGroup>
      </div>
      <Menu>
        <MenuTrigger render={<Button variant="ghost" size="sm" />}>
          <DownloadIcon />
          Export
        </MenuTrigger>
        <MenuPopup align="end" side="bottom" sideOffset={6}>
          {EXPORTS.map((entry) => (
            <MenuItem key={entry.label} onClick={() => exportJob(entry.prompt)}>
              {entry.label}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
      {/* Clear of the panel's own controls, fixed at the title row's end (T3 keeps pr-28 for them). */}
      <span aria-hidden className="w-28 shrink-0" />
    </div>
  );
}
