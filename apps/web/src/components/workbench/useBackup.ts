import { useState } from "react";

import { toastManager } from "../ui/toast";
import { readStudioImport } from "./studioImportBridge";

/** Where a project was last backed up to, and when, on this computer. */
export interface LastBackup {
  readonly folder: string;
  readonly at: number;
}

const KEY = "studio:backups";

function readBackups(): Record<string, LastBackup> {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}") as unknown;
    return stored !== null && typeof stored === "object"
      ? (stored as Record<string, LastBackup>)
      : {};
  } catch {
    return {};
  }
}

/** The folder a project backs up to: one named for it inside the folder the person chose. */
export function backupFolder(chosen: string, projectName: string): string {
  const name = projectName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Project";
  return `${chosen.replace(/[\\/]+$/, "")}/${name}`;
}

/** A backup's folder as a person knows it: its last two folders, "My Drive/Roomba". */
export function backupPlace(folder: string): string {
  return folder.split(/[\\/]/).filter(Boolean).slice(-2).join("/");
}

/** An error from the desktop app, without Electron's "Error invoking remote method" wrapping. */
const plainError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']*': (?:Error: )?/,
    "",
  );

/**
 * Back up for one project (`ProjectSwitcher`'s menu): the first time, a folder the person chooses
 * (a Google Drive, Dropbox or iCloud folder carries it off this computer), then the same one each
 * time, where the desktop app copies the project's folders with their versions, only what changed
 * (`backUp` in `apps/desktop/src/studio/studioImportFiles.ts`). Remembered per project on this
 * computer. Not offered outside the desktop app, or in one built before Back up.
 */
export function useBackup(
  project: {
    readonly id: string;
    readonly name: string;
    readonly folders: ReadonlyArray<string>;
  } | null,
) {
  const [backups, setBackups] = useState(readBackups);
  const bridge = readStudioImport();
  const pickFolder = bridge?.pickFolder;
  const backUpInto = bridge?.backUp;
  const last = project === null ? null : (backups[project.id] ?? null);
  if (project === null || pickFolder === undefined || backUpInto === undefined) {
    return { available: false, last, backUp: null, changeFolder: null } as const;
  }

  const run = async (target: string) => {
    try {
      const result = await backUpInto(project.folders, target);
      const next = { ...readBackups(), [project.id]: { folder: result.folder, at: Date.now() } };
      setBackups(next);
      try {
        globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
      } catch {
        // Backed up all the same; the folder is asked for again next time.
      }
      toastManager.add({
        type: "success",
        title: `Backed up ${project.name}`,
        description:
          result.copied === 0
            ? `Nothing changed since the last backup, in ${backupPlace(result.folder)}.`
            : `${result.copied} ${result.copied === 1 ? "file" : "files"} copied to ${backupPlace(result.folder)}.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Couldn't back up",
        description: plainError(error),
      });
    }
  };
  const changeFolder = async () => {
    const chosen = await pickFolder(`Back up ${project.name}`, "Back up here");
    if (chosen !== null) await run(backupFolder(chosen, project.name));
  };
  const backUp = async () => {
    if (last === null) await changeFolder();
    else await run(last.folder);
  };
  return { available: true, last, backUp, changeFolder } as const;
}
