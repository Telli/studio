/**
 * A project's named sizes, as Studio's CAD service reads them from its scripts
 * (`cadgen/edit/sizes.py`): each part's own (the named numbers at the top of its script) and the
 * shared ones several parts import (`sizes.py` beside the parts), for the Overview's Sizes.
 */

export interface NamedSize {
  readonly name: string;
  readonly line: number;
  /** As written: a number ("40.0") or a formula of other sizes ("2 * WALL"). */
  readonly text: string;
  /** The number; null for a formula, which changes where its sizes are written. */
  readonly value: number | null;
  readonly editable: boolean;
  /** What it is for, from the comment on its line. */
  readonly note: string;
}

export interface SizeGroup {
  /** The script, from the project's folder. */
  readonly file: string;
  /** The script's own name, its file's stem. */
  readonly name: string;
  readonly kind: "shared" | "part";
  /** For shared sizes, the parts that import them. */
  readonly usedBy: ReadonlyArray<string>;
  readonly sizes: ReadonlyArray<NamedSize>;
}

export interface ProjectSizes {
  readonly units: string;
  /** Where a new shared size goes: `sizes.py` beside the parts. */
  readonly sharedFile: string;
  readonly groups: ReadonlyArray<SizeGroup>;
}

/** A size's name, as the scripts write one: capitals, digits and underscores. */
export const SIZE_NAME = /^[A-Z][A-Z0-9_]*$/;
/** A size's value as typed: a plain number. */
export const SIZE_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readSize(value: unknown): NamedSize | null {
  if (!isRecord(value)) return null;
  const { name, line, text, editable, note } = value;
  if (typeof name !== "string" || typeof line !== "number" || typeof text !== "string") return null;
  return {
    name,
    line,
    text,
    value: typeof value.value === "number" ? value.value : null,
    editable: editable === true,
    note: typeof note === "string" ? note : "",
  };
}

function readGroup(value: unknown): SizeGroup | null {
  if (!isRecord(value) || typeof value.file !== "string" || typeof value.name !== "string") {
    return null;
  }
  if (!Array.isArray(value.sizes)) return null;
  return {
    file: value.file,
    name: value.name,
    kind: value.kind === "shared" ? "shared" : "part",
    usedBy: Array.isArray(value.usedBy)
      ? value.usedBy.filter((part): part is string => typeof part === "string")
      : [],
    sizes: value.sizes.map(readSize).filter((size): size is NamedSize => size !== null),
  };
}

/** The CAD service's answer read as the project's sizes, or why there are none. */
export function readSizes(reply: unknown): ProjectSizes | { readonly error: string } {
  if (!isRecord(reply) || reply.ok !== true || !Array.isArray(reply.groups)) {
    return {
      error:
        isRecord(reply) && typeof reply.error === "string"
          ? reply.error
          : "Studio's CAD service did not answer.",
    };
  }
  return {
    units: typeof reply.units === "string" ? reply.units : "mm",
    sharedFile: typeof reply.sharedFile === "string" ? reply.sharedFile : "sizes.py",
    groups: reply.groups.map(readGroup).filter((group): group is SizeGroup => group !== null),
  };
}

/** Why Sizes cannot show or change a size, in plain words: the CAD service's own when it says one. */
export function plainSizesError(error: string): string {
  // A CAD service started before Sizes came in has no such route.
  if (/not found/i.test(error)) return "Studio needs a restart before it can show sizes.";
  return error;
}

/** What the agent is told of a size changed in Sizes, as a hand change is told. */
export function sizeChangedNote(input: {
  readonly name: string;
  readonly file: string;
  readonly from: string;
  readonly to: string;
}): string {
  return `In Sizes I changed ${input.name} in ${input.file} from ${input.from} to ${input.to}.`;
}

/** What the agent is told of a shared size added in Sizes. */
export function sharedAddedNote(input: {
  readonly name: string;
  readonly file: string;
  readonly text: string;
}): string {
  return `In Sizes I added the shared size ${input.name} = ${input.text} to ${input.file}.`;
}

/** The job Use it in parts hands the agent: the shared size in place of the parts' own numbers. */
export function sharedSizePrompt(input: { readonly name: string; readonly file: string }): string {
  return `Use the shared size ${input.name} from ${input.file} in the parts that need it, in place of their own numbers, importing it by name.`;
}
