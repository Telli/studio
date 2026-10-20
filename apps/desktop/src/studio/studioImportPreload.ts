import { ipcRenderer } from "electron";

import {
  STUDIO_IMPORT_COPY_CHANNEL,
  STUDIO_IMPORT_PICK_CHANNEL,
  STUDIO_IMPORT_ROOTS_CHANNEL,
  STUDIO_IMPORT_SCAN_CHANNEL,
} from "./studioImportChannels.ts";

/** `window.studioImport`: Studio's Import on this computer (`studioImport.ts`). */
export const studioImportBridge = {
  roots: () => ipcRenderer.invoke(STUDIO_IMPORT_ROOTS_CHANNEL),
  scan: (root: string) => ipcRenderer.invoke(STUDIO_IMPORT_SCAN_CHANNEL, root),
  pick: () => ipcRenderer.invoke(STUDIO_IMPORT_PICK_CHANNEL),
  copy: (sources: ReadonlyArray<string>, folder: string) =>
    ipcRenderer.invoke(STUDIO_IMPORT_COPY_CHANNEL, sources, folder),
};
