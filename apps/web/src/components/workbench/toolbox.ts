import {
  type HardwareAction,
  type HardwareActionGroup,
  type HardwareActionMenu,
  jobFits,
} from "./hardwareActions";
import { libraryHref } from "./library/librarySearch";
import { lowerName } from "./partNames";

/** A run of jobs in a group, under its title. */
export interface ToolboxSection {
  readonly title: string;
  readonly actions: ReadonlyArray<HardwareAction>;
}

/** One of the Toolbox's three groups and its jobs. */
export interface ToolboxGroup {
  readonly group: HardwareActionGroup;
  readonly sections: ReadonlyArray<ToolboxSection>;
}

const GROUP_ORDER: ReadonlyArray<HardwareActionGroup> = ["Evaluate", "Manufacture", "Document"];

/**
 * Jobs as the Toolbox shows them: always Evaluate, Manufacture and Document, in that order, a tab
 * each, every section open and every job a tile like the others. The menus' everyday sections come
 * first and the ones they keep under "More" after, nothing folded; a group with no job has no
 * sections.
 */
export function toolboxGroups(menus: ReadonlyArray<HardwareActionMenu>): ToolboxGroup[] {
  return GROUP_ORDER.map((group) => {
    const menu = menus.find((entry) => entry.group === group);
    return { group, sections: menu ? [...menu.sections, ...menu.others] : [] };
  });
}

/**
 * A group's sections in the rail's order: a section of one tile draws the next such section up to
 * it, so the two share a row wherever they stood (1, 2, 1 comes out 1, 1, 2). The one left over
 * stays where it was. In the list, not a dense grid, so tab order stays what the rail shows.
 */
export function pairLoneSections(
  sections: ReadonlyArray<ToolboxSection>,
): ReadonlyArray<ToolboxSection> {
  const isLone = (section: ToolboxSection) => section.actions.length === 1;
  const rest = [...sections];
  const paired: ToolboxSection[] = [];
  for (let section = rest.shift(); section !== undefined; section = rest.shift()) {
    paired.push(section);
    if (!isLone(section)) continue;
    const next = rest.findIndex(isLone);
    if (next !== -1) paired.push(...rest.splice(next, 1));
  }
  return paired;
}

const FOLDED_KEY = "studio:toolbox-folded";
const TAB_KEY = "studio:toolbox-tab";

/** The group the Toolbox was left on, on this device; Evaluate when never chosen. */
export function readToolboxTab(): HardwareActionGroup {
  try {
    const stored = globalThis.localStorage?.getItem(TAB_KEY);
    return GROUP_ORDER.find((group) => group === stored) ?? "Evaluate";
  } catch {
    return "Evaluate";
  }
}

/** Remembers, for this device, the group the Toolbox shows. */
export function writeToolboxTab(group: HardwareActionGroup): void {
  try {
    globalThis.localStorage?.setItem(TAB_KEY, group);
  } catch {
    // Storage is full or off: the choice holds until the window closes.
  }
}

/** Whether the Toolbox was left collapsed to its edge on this device; open when never chosen. */
export function readToolboxFolded(): boolean {
  try {
    return globalThis.localStorage?.getItem(FOLDED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Remembers, for this device, whether the Toolbox is collapsed to its edge. */
export function writeToolboxFolded(folded: boolean): void {
  try {
    globalThis.localStorage?.setItem(FOLDED_KEY, String(folded));
  } catch {
    // Storage is full or off: the choice holds until the window closes.
  }
}

/** A group's jobs, in all its sections. */
export function jobCount(group: ToolboxGroup): number {
  return group.sections.reduce((count, section) => count + section.actions.length, 0);
}

/**
 * Why a job's tile can't be pressed for the file in front (`kind`, null with none open), by what
 * the job works on: "Works on a board or a schematic. Open one to use it." Null when the job fits
 * the file, and its tile runs it.
 */
export function toolboxWorksOn(action: HardwareAction, kind: string | null): string | null {
  if (kind !== null && jobFits(action, kind)) return null;
  if (action.kinds === null) return "Works on any file. Open one to use it.";
  const kinds = action.kinds.map((name) => {
    const lower = lowerName(name);
    // "an assembly", and "an FEA study" as it is said.
    return `${/^([aeiou]|FEA\b)/.test(lower) ? "an" : "a"} ${lower}`;
  });
  const listed = new Intl.ListFormat("en", { type: "disjunction" }).format(kinds);
  return `Works on ${listed}. Open one to use it.`;
}

/**
 * The line under a group none of whose jobs fit the file in front (a CAM job has nothing in
 * Analysis), where every tile is dimmed; null when one fits.
 */
export function toolboxLeftOut(group: ToolboxGroup, kind: string): string | null {
  const fits = group.sections.some((section) =>
    section.actions.some((action) => jobFits(action, kind)),
  );
  if (fits) return null;
  return `None of these work on this ${lowerName(kind)}. Pause on one to see what it works on.`;
}

/**
 * The footer link "See what each makes": the Library open on the group. Its Make one comes back to
 * `from` only while the workspace has a New to take the request (`workspaceOpen`, as ⌘K's Library
 * does); from elsewhere it goes to Home's.
 */
export function toolboxLibraryLink(
  group: HardwareActionGroup,
  where: { readonly workspaceOpen: boolean; readonly from: string },
) {
  return libraryHref({ group, ...(where.workspaceOpen ? { from: where.from } : {}) });
}

/**
 * Whether the Toolbox shows as its edge. On a wide panel, as the person left it on this device; on
 * a narrow one (`toolboxNarrowRem`) folded, so the model keeps the room, until opened there.
 */
export function toolboxFolded(input: {
  readonly chosen: boolean;
  readonly narrow: boolean;
  readonly openedNarrow: boolean;
}): boolean {
  return input.narrow ? !input.openedNarrow : input.chosen;
}

/**
 * Under this width the workspace panel is narrow, and the Toolbox starts folded. In AI it writes
 * into the chat, so it stays out down to a small panel. In CAD the model is the work: beside a chat
 * the panel is about 1270px wide and the Toolbox folds, across the window (about 1800px) it stays out.
 */
export function toolboxNarrowRem(simple: boolean): number {
  return simple ? 40 : 84;
}
