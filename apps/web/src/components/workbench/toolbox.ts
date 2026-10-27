import {
  type HardwareAction,
  type HardwareActionGroup,
  type HardwareActionMenu,
} from "./hardwareActions";
import { libraryHref } from "./library/librarySearch";

/** A run of jobs in a group, under its title; folded ones wait shut until opened in place. */
export interface ToolboxSection {
  readonly title: string;
  readonly actions: ReadonlyArray<HardwareAction>;
  readonly folded: boolean;
}

/** One of the Toolbox's three groups, with the Library entry whose picture marks it. */
export interface ToolboxGroup {
  readonly group: HardwareActionGroup;
  readonly picture: string;
  readonly sections: ReadonlyArray<ToolboxSection>;
}

/** The Library entry (`libraryCatalog.ts`) whose picture marks each group. */
export const GROUP_PICTURES: Record<HardwareActionGroup, string> = {
  Evaluate: "doc:simulation",
  Manufacture: "doc:cam-job",
  Document: "doc:drawing",
};

const GROUP_ORDER: ReadonlyArray<HardwareActionGroup> = ["Evaluate", "Manufacture", "Document"];

/**
 * The part's jobs as the Toolbox shows them: always Evaluate, Manufacture and Document, in that
 * order. A group lists its menu's everyday sections open, then the ones the menu keeps under
 * "More" folded; a group none of the jobs apply to has no sections.
 */
export function toolboxGroups(menus: ReadonlyArray<HardwareActionMenu>): ToolboxGroup[] {
  return GROUP_ORDER.map((group) => {
    const menu = menus.find((entry) => entry.group === group);
    return {
      group,
      picture: GROUP_PICTURES[group],
      sections: menu
        ? [
            ...menu.sections.map((section) => ({ ...section, folded: false })),
            ...menu.others.map((section) => ({ ...section, folded: true })),
          ]
        : [],
    };
  });
}

const FOLDED_KEY = "studio:toolbox-folded";

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

/** A group's jobs, its folded sections' too. */
export function jobCount(group: ToolboxGroup): number {
  return group.sections.reduce((count, section) => count + section.actions.length, 0);
}

/**
 * The footer link "What each makes…": the Library open on the group. Its Make one comes back to
 * `from` only while the workspace has a New to take the request (`workspaceOpen`, as ⌘K's Library
 * does); from elsewhere it goes to Home's.
 */
export function toolboxLibraryLink(
  group: HardwareActionGroup,
  where: { readonly workspaceOpen: boolean; readonly from: string },
) {
  return libraryHref({ group, ...(where.workspaceOpen ? { from: where.from } : {}) });
}

/** What the Toolbox shows: its groups, or one group's sections and jobs. */
export interface ToolboxView {
  readonly open: HardwareActionGroup | null;
}

export type ToolboxEvent =
  | { readonly type: "open"; readonly group: HardwareActionGroup }
  | { readonly type: "back" }
  | { readonly type: "part-changed" };

/** A group press opens it; back, or another part coming in front, returns to the groups. */
export function toolboxView(_state: ToolboxView, event: ToolboxEvent): ToolboxView {
  return { open: event.type === "open" ? event.group : null };
}

/**
 * Whether the Toolbox shows as its edge. On a wide panel, as the person left it on this device; on
 * a narrow one (`TOOLBOX_NARROW_REM`) folded, so the model keeps the room, until opened there.
 */
export function toolboxFolded(input: {
  readonly chosen: boolean;
  readonly narrow: boolean;
  readonly openedNarrow: boolean;
}): boolean {
  return input.narrow ? !input.openedNarrow : input.chosen;
}

/** Under this width the workspace panel is narrow, and the Toolbox starts folded. */
export const TOOLBOX_NARROW_REM = 40;
