import { describe, expect, it } from "vite-plus/test";

import { ACTION_SECTIONS, HARDWARE_ACTIONS, type HardwareAction } from "./hardwareActions";
import { MENU_ICONS } from "./kinds";
import { hasSectionIcon, JOB_ICON_IDS, toolIcon } from "./toolIcons";

/**
 * Jobs in one section that may share a picture, as `[section, first job, second job]`, each with
 * why. Empty: every section's tiles read as different tools today.
 */
const SHARED_IN_SECTION: ReadonlyArray<readonly [string, string, string]> = [];

const shareAllowed = (section: string, a: string, b: string) =>
  SHARED_IN_SECTION.some(
    ([where, first, second]) =>
      where === section && ((first === a && second === b) || (first === b && second === a)),
  );

const job = (overrides: Partial<HardwareAction>): HardwareAction => ({
  ...HARDWARE_ACTIONS[0]!,
  ...overrides,
});

describe("toolIcon", () => {
  it("gives every job a picture of its own, not just its group's", () => {
    const generic = HARDWARE_ACTIONS.filter(
      (action) => toolIcon(action) === MENU_ICONS[action.group],
    );
    expect(generic.map((action) => action.id)).toEqual([]);
  });

  it("keys every picture of its own to a real job", () => {
    const ids = new Set(HARDWARE_ACTIONS.map((action) => action.id));
    expect(JOB_ICON_IDS.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("tells the tools in a section apart", () => {
    const clashes: string[] = [];
    for (const section of ACTION_SECTIONS) {
      const jobs = HARDWARE_ACTIONS.filter((action) => action.section === section.id);
      jobs.forEach((a, index) => {
        for (const b of jobs.slice(index + 1)) {
          if (toolIcon(a) === toolIcon(b) && !shareAllowed(section.id, a.id, b.id)) {
            clashes.push(`${section.id}: ${a.id} and ${b.id}`);
          }
        }
      });
    }
    expect(clashes).toEqual([]);
  });

  it("falls back to the section's picture, then the group's, for a job without one", () => {
    expect(ACTION_SECTIONS.filter((section) => !hasSectionIcon(section.id))).toEqual([]);
    const heat = job({ id: "new-heat-job", group: "Evaluate", section: "heat" });
    const thermal = HARDWARE_ACTIONS.find((action) => action.id === "thermal")!;
    expect(toolIcon(heat)).toBe(toolIcon(thermal));
    const loose = job({ id: "new-job", group: "Document", section: "new-section" });
    expect(toolIcon(loose)).toBe(MENU_ICONS.Document);
  });
});
