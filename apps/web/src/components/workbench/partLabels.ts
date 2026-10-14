import { formatRelativeTimeLabel } from "~/timestampFormat";

import type { PartBuild } from "./partContext";

/** The last build in words: "Building", "Build failed", "Built 3m ago", "Saved 3m ago". */
export function buildLabel(build: PartBuild | null): { text: string; failed: boolean } | null {
  if (build === null) return null;
  switch (build.state) {
    case "building":
      return { text: "Building", failed: false };
    case "failed":
      return { text: "Build failed", failed: true };
    case "built":
    case "saved": {
      const ago = formatRelativeTimeLabel(new Date(build.at).toISOString());
      return { text: `${build.state === "built" ? "Built" : "Saved"} ${ago}`, failed: false };
    }
  }
}

/** The declared materials in words; null while unread, `missing` when the model declares none. */
export function materialLabel(
  materials: ReadonlyArray<string> | null,
): { text: string; missing: boolean } | null {
  if (materials === null) return null;
  const [first, ...rest] = materials;
  if (first === undefined) return { text: "No material", missing: true };
  return { text: rest.length === 0 ? first : `${first} and ${rest.length} more`, missing: false };
}
