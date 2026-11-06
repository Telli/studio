import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";

import { humanName, partName } from "./partNames";
import { normalPath } from "./sameFile";

/** A panel tab, by what its title reads and the file behind it (`surfaceFile`). */
export interface TitledTab {
  readonly id: string;
  readonly title: string;
  /** The file's path, or a model's document id; null for a tab that shows no file. */
  readonly file: string | null;
  /** Where a model's script is (`knownModelScript`): a document id names no folder. */
  readonly script?: string | undefined;
}

const fileKind = (tab: TitledTab) =>
  tab.file === null ? null : isDocumentId(tab.file) ? "Part" : (partName(tab.file)?.kind ?? null);

const fileFormat = (tab: TitledTab) => {
  if (tab.file === null) return null;
  if (isDocumentId(tab.file)) return "Model";
  return /\.([^./\\]+)$/.exec(tab.file)?.[1]?.toUpperCase() ?? null;
};

const parentFolder = (tab: TitledTab) => {
  const path = tab.script ?? tab.file;
  if (path === null || isDocumentId(path)) return null;
  const folder = normalPath(path).split("/").at(-2);
  return folder === undefined ? null : humanName(folder);
};

const WAYS_TO_TELL = [fileKind, fileFormat, parentFolder];

/**
 * What tells open tabs apart when their titles are the same: for each such tab, its kind ("Part",
 * "Drawing"), its format ("STEP", "Model") or its parent folder ("Assemblies"), the first of them
 * no other tab of that title shares. A tab with a title of its own needs none, and is left out.
 */
export function tabSuffixes(tabs: ReadonlyArray<TitledTab>): ReadonlyMap<string, string> {
  const byTitle = new Map<string, TitledTab[]>();
  for (const tab of tabs) {
    const key = tab.title.toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), tab]);
  }
  const suffixes = new Map<string, string>();
  for (const same of byTitle.values()) {
    if (same.length < 2) continue;
    for (const tab of same) {
      for (const way of WAYS_TO_TELL) {
        const mark = way(tab);
        if (mark !== null && same.filter((other) => way(other) === mark).length === 1) {
          suffixes.set(tab.id, mark);
          break;
        }
      }
    }
  }
  return suffixes;
}
