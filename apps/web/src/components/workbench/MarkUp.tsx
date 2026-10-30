import type { ScopedThreadRef } from "@t3tools/contracts";
import { PenLineIcon } from "lucide-react";
import { useRef, useState } from "react";

import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { surfaceFile } from "./sameFile";
import { readStudioImport } from "./studioImportBridge";
import { useOpenInWorkbench } from "./useOpenInWorkbench";

/** What a markup is named for: the file the tab shows, else what the tab is. */
export function markupName(file: string | null, kind: string): string {
  return file === null ? kind : (file.split("/").at(-1) ?? file);
}

/**
 * Mark up the tab in front of the workspace panel, whatever it shows (a report, a parts list, the
 * Overview, a page): a picture of it, taken from the window as it is, is saved into the project
 * (`.studio/markups`) and opened in the CAD view, to draw on with Pencil and Shapes and send with
 * Quick Edit as a drawing is. A tab the CAD view shows has those tools already, so it has no
 * button. Desktop app only: the picture is the window's own (`studioImport.capture`).
 */
export function MarkUpButton(props: {
  readonly threadRef: ScopedThreadRef;
  readonly folder: string | null;
}) {
  const { threadRef, folder } = props;
  const bridge = readStudioImport();
  const front = useRightPanelStore((store) =>
    selectActiveRightPanelSurface(store.byThreadKey, threadRef),
  );
  const open = useOpenInWorkbench(threadRef);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const capture = bridge?.capture;
  if (capture === undefined || folder === null || front === null || front.kind === "plugin-app") {
    return null;
  }

  const markUp = async () => {
    // The tab's own area, under this panel's toolbar: not the toolbar, not the Toolbox beside it.
    const surface = buttonRef.current
      ?.closest("[data-right-panel-toolbar]")
      ?.parentElement?.querySelector("[data-right-panel-surface-content]");
    if (!(surface instanceof HTMLElement)) return;
    const box = surface.getBoundingClientRect();
    setBusy(true);
    try {
      const file = await capture(
        { x: box.left, y: box.top, width: box.width, height: box.height },
        folder,
        markupName(surfaceFile(front), front.kind),
      );
      open(file);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not mark this up",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      ref={buttonRef}
      variant="outline"
      size="sm"
      disabled={busy}
      title="Draw on this tab and send a note about it"
      onClick={() => void markUp()}
    >
      <PenLineIcon aria-hidden="true" />
      Mark up
    </Button>
  );
}
