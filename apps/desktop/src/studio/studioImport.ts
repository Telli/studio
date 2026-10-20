// @effect-diagnostics nodeBuiltinImport:off - the IPC handlers check paths with node:path.
import * as NodePath from "node:path";

import { BrowserWindow, dialog, ipcMain } from "electron";
import * as Effect from "effect/Effect";

import {
  STUDIO_IMPORT_COPY_CHANNEL,
  STUDIO_IMPORT_PICK_CHANNEL,
  STUDIO_IMPORT_ROOTS_CHANNEL,
  STUDIO_IMPORT_SCAN_CHANNEL,
} from "./studioImportChannels.ts";
import { copyInto, defaultRoots, scanFolder } from "./studioImportFiles.ts";

export type { StudioImportFile, StudioImportScan } from "./studioImportFiles.ts";

/**
 * Studio's Import on this computer: the folders a first scan offers, a walk of one folder for its
 * engineering files (`studioImportKind`), a picker for files or folders, and copying files into a
 * project's folder. Proposing projects from what a walk finds is the web's
 * (`apps/web/src/components/workbench/importPlan.ts`). The page reaches it as
 * `window.studioImport` (`studioImportPreload.ts`). It only reads, except where it copies into a
 * folder the person chose.
 */

const isAbsolutePath = (value: unknown): value is string =>
  typeof value === "string" && value !== "" && NodePath.isAbsolute(value);

export const installStudioImport = Effect.fn("desktop.studioImport.install")(function* () {
  yield* Effect.sync(() => {
    ipcMain.handle(STUDIO_IMPORT_ROOTS_CHANNEL, () => defaultRoots());
    ipcMain.handle(STUDIO_IMPORT_SCAN_CHANNEL, (_event, root: unknown) => {
      if (!isAbsolutePath(root)) throw new Error("A scan needs a folder's full path.");
      return scanFolder(root);
    });
    ipcMain.handle(STUDIO_IMPORT_PICK_CHANNEL, async (event) => {
      const options: Electron.OpenDialogOptions = {
        title: "Import",
        buttonLabel: "Import",
        properties: ["openFile", "openDirectory", "multiSelections"],
      };
      const window = BrowserWindow.fromWebContents(event.sender);
      const result =
        window === null
          ? await dialog.showOpenDialog(options)
          : await dialog.showOpenDialog(window, options);
      return result.canceled ? [] : result.filePaths;
    });
    ipcMain.handle(STUDIO_IMPORT_COPY_CHANNEL, (_event, sources: unknown, folder: unknown) => {
      if (!Array.isArray(sources) || !sources.every(isAbsolutePath) || !isAbsolutePath(folder)) {
        throw new Error("Copying needs full paths.");
      }
      return copyInto(sources, folder);
    });
  });
});
