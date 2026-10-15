import type { StudioProjectBrief } from "@t3tools/contracts";

/**
 * A project's brief: what Studio and the agent should know before any design
 * work. It lives on the project (`StudioProject` in contracts), which the
 * server hands to every agent in the project's folders; the sketches, photos,
 * datasheets and mating parts it gathers are filed under `brief/references/`.
 */

import { EMPTY_STUDIO_BRIEF as EMPTY_BRIEF } from "@t3tools/shared/studioProjects";

export {
  EMPTY_STUDIO_BRIEF as EMPTY_BRIEF,
  STUDIO_PROCESSES as PROCESSES,
} from "@t3tools/shared/studioProjects";

export type ProjectBrief = StudioProjectBrief;

export const BRIEF_REFERENCES = "brief/references";

/**
 * The brief in a line, for the project page: only what has been decided (the
 * purpose's first line, material, process, quantity), then the units once
 * anything is. Empty while nothing is, so an unset brief says nothing.
 */
export function briefSummary(brief: ProjectBrief): ReadonlyArray<{ label: string; value: string }> {
  const quantity = brief.quantity.trim();
  const decided = [
    { label: "Purpose", value: brief.purpose.trim().split("\n")[0]?.trim() ?? "" },
    { label: "Material", value: brief.material.trim() },
    { label: "Process", value: brief.process === EMPTY_BRIEF.process ? "" : brief.process.trim() },
    { label: "Quantity", value: quantity === "" ? "" : `Quantity ${quantity}` },
  ].filter((entry) => entry.value !== "");
  if (decided.length === 0) return [];
  return [...decided, { label: "Units", value: brief.units === "in" ? "Inches" : "Millimeters" }];
}
