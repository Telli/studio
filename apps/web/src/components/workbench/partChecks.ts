import { type CheckResult, resultsFor } from "./checkResults";
import { classifyProjectFile } from "./projectFiles";
import type { FolderChecks } from "./useProjectChecks";

const normal = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");
const baseName = (path: string) => normal(path).split("/").at(-1) ?? path;

/** A check about the file on screen, and the folder its result is in. */
export interface ShownCheck {
  readonly root: string;
  readonly result: CheckResult;
}

/**
 * The checks about the file the viewer shows (`shown`, its full path): a
 * part's own results, which the title block lists beside it, and, when what is
 * shown is a check's result (an FEA study's picture), the part it checked, by
 * its full path, to go back to.
 */
export function shownChecks(
  folders: ReadonlyArray<FolderChecks>,
  shown: string,
): { readonly results: ReadonlyArray<ShownCheck>; readonly of: string | null } {
  const target = normal(shown);
  const inside = folders.find((folder) => target.startsWith(`${normal(folder.root)}/`));
  const file = classifyProjectFile(
    inside === undefined ? baseName(target) : target.slice(normal(inside.root).length + 1),
  );
  const all = folders.flatMap((folder) =>
    folder.results.map((result) => ({ root: folder.root, result })),
  );
  const results =
    file !== null && file.group === "Models"
      ? all.filter(({ result }) => resultsFor(file, [result]).length > 0)
      : [];
  const study = all.find(({ root, result }) => `${normal(root)}/${result.model}` === target);
  if (study === undefined) return { results, of: null };
  const part = study.result.part.toLowerCase();
  for (const folder of folders) {
    const found = (folder.paths ?? []).find((path) => baseName(path).toLowerCase() === part);
    if (found !== undefined) return { results, of: `${normal(folder.root)}/${found}` };
  }
  return { results, of: null };
}
