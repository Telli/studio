import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * What a hardware project is for, as its engineer sets it: every field is
 * free text but units, and an empty string is "not said yet".
 */
export const StudioProjectBrief = Schema.Struct({
  purpose: Schema.String,
  requirements: Schema.String,
  units: Schema.Literals(["mm", "in"]),
  material: Schema.String,
  process: Schema.String,
  quantity: Schema.String,
  links: Schema.String,
  notes: Schema.String,
});
export type StudioProjectBrief = typeof StudioProjectBrief.Type;

/**
 * A Studio project: a named grouping of folders (each an ordinary project's
 * workspace root) with one brief. A thread in any of its folders works in all
 * of them, the way a coding agent takes extra working directories, and reads
 * the brief first (`packages/shared/src/studioProjects.ts`).
 */
export const StudioProject = Schema.Struct({
  name: TrimmedNonEmptyString,
  /** The kind it started as (`part`, `product`, `board`, `robot`); null for none. */
  template: Schema.NullOr(Schema.String),
  brief: StudioProjectBrief,
  /** Absolute folder paths, in the order shown; new threads start in the first. */
  folders: Schema.Array(Schema.String),
  createdAt: Schema.String,
});
export type StudioProject = typeof StudioProject.Type;
