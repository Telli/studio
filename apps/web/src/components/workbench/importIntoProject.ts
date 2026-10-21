import { useCallback } from "react";

import { toastManager } from "../ui/toast";
import { readStudioImport } from "./studioImportBridge";

/** An error from the desktop app in its own words, without Electron's wrapping. */
export const plainError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']*': (?:Error: )?/,
    "",
  );

/**
 * Import inside a project, as a file uploaded into a Drive folder: the files or folders picked
 * (Import in the panel's toolbar) or dropped on the Overview are copied into the project's folder,
 * where the Overview lists them. The originals stay where they are, and nothing there is written
 * over: a name already taken becomes "name (2)". Null outside the desktop app, which copies them.
 */
export function useImportIntoProject(
  folder: string | null,
  projectName: string,
): {
  readonly pick: () => Promise<void>;
  readonly copy: (paths: ReadonlyArray<string>) => Promise<void>;
} | null {
  const bridge = readStudioImport();
  const copy = useCallback(
    async (paths: ReadonlyArray<string>) => {
      if (bridge === null || folder === null || paths.length === 0) return;
      try {
        const copied = await bridge.copy(paths, folder);
        toastManager.add({
          type: "success",
          title: `Imported ${copied.length === 1 ? "1 item" : `${copied.length} items`} into ${projectName}`,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: `Could not import into ${projectName}`,
          description: plainError(error),
        });
      }
    },
    [bridge, folder, projectName],
  );
  const pick = useCallback(async () => {
    if (bridge === null) return;
    await copy(await bridge.pick());
  }, [bridge, copy]);
  return bridge === null || folder === null ? null : { pick, copy };
}
