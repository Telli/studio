import {
  type HardwareAction,
  type HardwareActionGroup,
  type HardwareActionMenu,
} from "./hardwareActions";
import { MENU_WORDS } from "./kinds";
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
 * The part's jobs as the Toolbox shows them: always Evaluate, Manufacture and Document, in that
 * order, a tab each, every section open and every job a tile like the others. The menus' everyday sections
 * come first and the ones they keep under "More" after, nothing folded; a group none of the jobs
 * apply to has no sections.
 */
export function toolboxGroups(menus: ReadonlyArray<HardwareActionMenu>): ToolboxGroup[] {
  return GROUP_ORDER.map((group) => {
    const menu = menus.find((entry) => entry.group === group);
    return { group, sections: menu ? [...menu.sections, ...menu.others] : [] };
  });
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
 * The group the Toolbox shows: the one left open, or where that has no job for this file (a CAM job
 * has nothing in Manufacture), the first that has one. The one left open stays remembered.
 */
export function toolboxShownGroup(
  groups: ReadonlyArray<ToolboxGroup>,
  tab: HardwareActionGroup,
): ToolboxGroup | undefined {
  const left = groups.find((group) => group.group === tab);
  return left !== undefined && jobCount(left) > 0
    ? left
    : (groups.find((group) => jobCount(group) > 0) ?? left);
}

/**
 * What the file in front leaves out, in plain words and with what to open for it; null when every
 * group has jobs for it.
 */
export function toolboxLeftOut(groups: ReadonlyArray<ToolboxGroup>, kind: string): string | null {
  const names = groups
    .filter((group) => jobCount(group) === 0)
    .map((group) => MENU_WORDS[group.group]);
  if (names.length === 0) return null;
  const listed = new Intl.ListFormat("en", { type: "disjunction" }).format(names);
  return `No ${listed} jobs for this ${lowerName(kind)}. Open a part to see them.`;
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
