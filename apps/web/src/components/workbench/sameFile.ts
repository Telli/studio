import type { RightPanelSurface } from "~/rightPanelStore";

const normal = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");

/**
 * Whether two paths name the same file, the one written in the thread's folder and the other in
 * full, as a chat link and the Overview each name a part: so a file opens in one tab, not two.
 */
export function sameFile(a: string, b: string): boolean {
  const left = normal(a);
  const right = normal(b);
  return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

/** The file a panel tab shows, in the words it was opened with; null for a tab that shows none. */
export function surfaceFile(surface: RightPanelSurface): string | null {
  if (surface.kind === "file") return surface.relativePath;
  if (surface.kind !== "plugin-app") return null;
  if (surface.file !== undefined) return surface.file;
  // A view the agent opened (`agentViewSurface`) names its file only in its id.
  const named = /:agent:(.+)$/.exec(surface.id)?.[1];
  return named === undefined ? null : decodeURIComponent(named);
}
