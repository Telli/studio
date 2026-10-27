/**
 * Studio's examples: the finished projects it ships (`studio-sample/<id>/`), which the server lists
 * in its config (`samples`). The Examples page shows them, each one's page shows it view only, and
 * Make a copy to edit copies it into a new project of yours (`useExample`), so the example never
 * changes.
 */

import type { StudioSample } from "@t3tools/contracts";

/**
 * A new project's name, past the names already taken: the name itself, then "<name> 2" and on, so
 * a second copy of an example never takes the first one's name.
 */
export function copyName(name: string, existing: ReadonlyArray<string>): string {
  const taken = new Set(existing.map((entry) => entry.trim().toLowerCase()));
  const base = name.trim();
  if (!taken.has(base.toLowerCase())) return base;
  for (let count = 2; ; count++) {
    const next = `${base} ${count}`;
    if (!taken.has(next.toLowerCase())) return next;
  }
}

/**
 * A file of an example, as its `studio-sample.json` or a link names it, written with "/": null for
 * one outside the example's folder (an absolute path, a drive, or a ".." step), which nothing
 * opens.
 */
export function sampleFile(path: string): string | null {
  const segments = path.replaceAll("\\", "/").split("/");
  if (segments[0] === "" || /^[a-z]:$/i.test(segments[0] ?? "")) return null;
  const kept = segments.filter((segment) => segment !== ".");
  if (kept.length === 0 || kept.some((segment) => segment === ".." || segment === "")) return null;
  return kept.join("/");
}

/**
 * The examples as the Examples page lists them, by name: one per id, the first kept, each opening
 * on its main file inside its folder; one whose main file is outside it is left out.
 */
export function listExamples(samples: ReadonlyArray<StudioSample> | undefined): StudioSample[] {
  const byId = new Map<string, StudioSample>();
  for (const sample of samples ?? []) {
    const open = sampleFile(sample.open);
    if (open === null || byId.has(sample.id)) continue;
    byId.set(sample.id, { ...sample, open });
  }
  return [...byId.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

/** An example page's place in the URL: `file`, the file a copy opens on, kept only inside it. */
export interface ExampleSearch {
  readonly file?: string;
}

export function validateExampleSearch(search: Record<string, unknown>): ExampleSearch {
  const file = typeof search.file === "string" ? sampleFile(search.file) : null;
  return file === null ? {} : { file };
}
