// @effect-diagnostics nodeBuiltinImport:off - IPC handlers that walk and copy files with Node's own APIs.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { type StudioImportKind, studioImportKind } from "@t3tools/shared/studioImport";
import { BrowserWindow, dialog, ipcMain } from "electron";
import * as Effect from "effect/Effect";

import {
  STUDIO_IMPORT_COPY_CHANNEL,
  STUDIO_IMPORT_PICK_CHANNEL,
  STUDIO_IMPORT_ROOTS_CHANNEL,
  STUDIO_IMPORT_SCAN_CHANNEL,
} from "./studioImportChannels.ts";

/**
 * Studio's Import on this computer: the folders a first scan offers, a walk of one folder for its
 * engineering files (`studioImportKind`), a picker for files or folders, and copying files into a
 * project's folder. Proposing projects from what a walk finds is the web's
 * (`apps/web/src/components/workbench/importPlan.ts`). The page reaches it as
 * `window.studioImport` (`studioImportPreload.ts`). It only reads, except where it copies into a
 * folder the person chose.
 */

export interface StudioImportFile {
  readonly path: string;
  readonly kind: StudioImportKind;
  readonly size: number;
  readonly modifiedMs: number;
}

export interface StudioImportScan {
  readonly root: string;
  readonly files: ReadonlyArray<StudioImportFile>;
  /** The walk stopped at its limit; the folder holds more than it found. */
  readonly truncated: boolean;
}

/** Folders no engineering work lives in: tools' caches, other apps' data and bundles. */
const SKIPPED = new Set([
  "node_modules",
  "Library",
  "Applications",
  "venv",
  "__pycache__",
  "site-packages",
  "Caches",
]);
const BUNDLES = /\.(app|photoslibrary|bundle|framework)$/i;
const MAX_FILES = 20_000;
const MAX_DEPTH = 8;

export async function scanFolder(
  root: string,
  limits = { files: MAX_FILES, depth: MAX_DEPTH },
): Promise<StudioImportScan> {
  // A file dropped or picked on its own is its own scan.
  const rootStat = await NodeFSP.stat(root).catch(() => null);
  if (rootStat?.isFile()) {
    const kind = studioImportKind(root);
    return {
      root,
      files:
        kind === null
          ? []
          : [{ path: root, kind, size: rootStat.size, modifiedMs: rootStat.mtimeMs }],
      truncated: false,
    };
  }
  const files: StudioImportFile[] = [];
  let truncated = false;
  const walk = async (folder: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await NodeFSP.readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      if (entry.name.startsWith(".") || SKIPPED.has(entry.name) || BUNDLES.test(entry.name)) {
        continue;
      }
      const path = NodePath.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (depth < limits.depth) await walk(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = studioImportKind(entry.name);
      if (kind === null) continue;
      if (files.length >= limits.files) {
        truncated = true;
        return;
      }
      try {
        const stat = await NodeFSP.stat(path);
        files.push({ path, kind, size: stat.size, modifiedMs: stat.mtimeMs });
      } catch {
        // Gone or unreadable since the folder was listed: left out.
      }
    }
  };
  await walk(root, 0);
  return { root, files, truncated };
}

/** The folders a first scan offers: Documents, Desktop and Downloads, where they exist. */
export async function defaultRoots(
  home = NodeOS.homedir(),
): Promise<ReadonlyArray<{ readonly label: string; readonly path: string }>> {
  const roots: { label: string; path: string }[] = [];
  for (const label of ["Documents", "Desktop", "Downloads"]) {
    const path = NodePath.join(home, label);
    try {
      if ((await NodeFSP.stat(path)).isDirectory()) roots.push({ label, path });
    } catch {
      // Not on this computer.
    }
  }
  return roots;
}

/** A name in the folder nothing has yet: `part.step`, then `part (2).step`. */
async function freeName(folder: string, name: string): Promise<string> {
  const extension = NodePath.extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let n = 1; ; n += 1) {
    const candidate = NodePath.join(folder, n === 1 ? name : `${stem} (${n})${extension}`);
    try {
      await NodeFSP.access(candidate);
    } catch {
      return candidate;
    }
  }
}

/** Copies files or folders into a project's folder, never over a file already there. */
export async function copyInto(
  sources: ReadonlyArray<string>,
  folder: string,
): Promise<ReadonlyArray<string>> {
  await NodeFSP.mkdir(folder, { recursive: true });
  const copied: string[] = [];
  for (const source of sources) {
    const target = await freeName(folder, NodePath.basename(source));
    await NodeFSP.cp(source, target, { recursive: true, errorOnExist: true, force: false });
    copied.push(target);
  }
  return copied;
}

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
