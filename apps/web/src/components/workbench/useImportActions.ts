import { useMemo } from "react";

import { useImportDialogStore } from "./importDialogStore";
import { readStudioImport } from "./studioImportBridge";

/**
 * Import's two ways in from Studio's pages: Files or a folder (the desktop app's picker) and Scan
 * this computer. Null where there is no desktop app to read this computer's files.
 */
export function useImportActions(): {
  readonly scan: () => void;
  readonly pick: () => Promise<void>;
} | null {
  const show = useImportDialogStore((store) => store.show);
  const bridge = readStudioImport();
  return useMemo(
    () =>
      bridge === null
        ? null
        : {
            scan: () => show({ kind: "scan" }),
            pick: async () => {
              const paths = await bridge.pick();
              if (paths.length > 0) show({ kind: "paths", paths });
            },
          },
    [bridge, show],
  );
}
