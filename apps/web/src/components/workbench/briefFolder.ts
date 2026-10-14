import type { StudioProjectBrief } from "@t3tools/contracts";

/**
 * A project's brief: what Studio and the agent should know before any design
 * work. It lives on the project (`StudioProject` in contracts), which the
 * server hands to every agent in the project's folders; the sketches, photos,
 * datasheets and mating parts it gathers are filed under `brief/references/`.
 */

export {
  EMPTY_STUDIO_BRIEF as EMPTY_BRIEF,
  STUDIO_PROCESSES as PROCESSES,
} from "@t3tools/shared/studioProjects";

export type ProjectBrief = StudioProjectBrief;

export const BRIEF_REFERENCES = "brief/references";

/** The brief in a line, for the new-thread screen once it is set. */
export function briefSummary(brief: ProjectBrief): ReadonlyArray<{ label: string; value: string }> {
  return [
    { label: "Material", value: brief.material.trim() || "Not decided" },
    { label: "Process", value: brief.process.trim() || "Not decided" },
    { label: "Units", value: brief.units },
    { label: "Quantity", value: brief.quantity.trim() || "Not decided" },
  ];
}
