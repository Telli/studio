import { EMPTY_STUDIO_BRIEF, type StudioProjectKind } from "@t3tools/shared/studioProjects";

/** What a new project's brief is made from: its kind, and what its maker already knows of it. */
export interface NewProjectBriefInput {
  readonly kind: StudioProjectKind;
  readonly units: "mm" | "in";
  readonly material: string;
  readonly purpose: string;
  /** How it is made, when known (a copy of an example); the kind's own process otherwise. */
  readonly process?: string;
}

/**
 * A new project's brief: empty but for its units, material, process and purpose. The process is
 * the one given, or else the kind's, so a copy of a CNC example is a CNC project, not a part's.
 */
export function newProjectBrief(input: NewProjectBriefInput) {
  const process = input.process?.trim();
  return {
    ...EMPTY_STUDIO_BRIEF,
    units: input.units,
    material: input.material.trim(),
    process: process === undefined || process === "" ? input.kind.process : process,
    purpose: input.purpose.trim(),
  };
}
