import { APP_BASE_NAME } from "../../branding";
import type { SettingsSearchItem, SettingsSearchItemId } from "../settings/settingsSearch";
import { CODE_SETTINGS_SECTIONS, settingsSectionLabel } from "./studioInterface";

/**
 * Settings rows as the engineering interface shows them. A row is named by its
 * search id (`settingsSearch.ts`), which is also its element id, so one entry
 * here changes the row (`SettingsRow`) and its search result alike. The code
 * interface shows every row as written.
 */

/**
 * Rows an engineer has no use for: where threads start (checkout or worktree),
 * git, diffs and pull requests, usage-limit stops, the sidebar's coding
 * shelves, background git refreshes, the `t3` command and the legacy switches;
 * on Appearance the Dev and Nightly label, diff colors, the composer's branch
 * controls, the terminal font and word wrap (diffs and file sources); T3's
 * update track; a project's actions (its scripts and `t3.json`); and rows that do nothing in
 * Studio: project order (Home, the switcher and ⌘K always put the one opened last first) and
 * marking inactive chats done (the sidebar says when a chat was worked on, never Done).
 */
export const CODE_SETTINGS_ROWS: ReadonlySet<string> = new Set<SettingsSearchItemId>([
  "new-threads",
  "worktree-submodules",
  "start-from-origin",
  "project-grouping",
  "auto-resume-limited-threads",
  "snooze-limited-threads",
  "working-shelf",
  "auto-settle-merged-threads",
  "hide-whitespace-changes",
  "default-diff-file-state",
  "diff-layout",
  "proactive-panels",
  "background-activity",
  "cli-command",
  "legacy-plan-mode",
  "legacy-context-window-indicator",
  "legacy-sidebar",
  "environment-identification",
  "diff-color-scheme",
  "composer-context",
  "terminal-font",
  "word-wrap",
  "update-track",
  "project-actions",
  "project-order",
  "auto-settle-inactive-threads",
  "days-before-auto-settle",
  // Studio has no pins or archive, its chats' Delete always asks, and its Import is its own.
  "unpin-confirmation",
  "archive-confirmation",
  "delete-confirmation",
  "add-project-starts-in",
]);

interface SettingCopy {
  readonly title?: string;
  readonly description?: string;
}

/** Kept rows in plain words. Only the words change: each row sets the same value. */
const ENGINEERING_SETTINGS_COPY: ReadonlyMap<string, SettingCopy> = new Map<
  SettingsSearchItemId,
  SettingCopy
>([
  ["response-streaming", { description: "How a reply appears while the agent works." }],
  ["composer-rich-text", { description: "Show formatting such as bold and lists as you type." }],
  [
    "provider-update-checks",
    {
      title: "Agent update checks",
      description: "Check the installed AI agents for newer versions.",
    },
  ],
  [
    "continue-threads-after-server-update",
    {
      title: "Continue chats after restarts",
      description: `Pick up chats that were working when ${APP_BASE_NAME} updated, crashed or restarted.`,
    },
  ],
  [
    "text-generation-model",
    { title: "Model for short text", description: "Names chats and writes other short text." },
  ],
  ["diagnostics", { description: "Inspect processes, resource use, and logs." }],
  ["thread-notifications", { title: "Chat notifications" }],
  // T3's policy is T3's; the row keeps the fact, without its link (`SettingsPanels.tsx`).
  ["privacy-policy", { title: "Privacy", description: `${APP_BASE_NAME} sends no usage data.` }],
  ["code-font", { title: "Monospace font", description: "Code blocks and file previews." }],
]);

/** A row's own words in the engineering interface, or null where the row keeps its own. */
export function engineeringSettingCopy(
  id: string | undefined,
  engineering: boolean,
): SettingCopy | null {
  return (engineering && id !== undefined && ENGINEERING_SETTINGS_COPY.get(id)) || null;
}

/** Settings search in the engineering interface: only what it shows, by the names it shows. */
export function engineeringSettingsSearchItems(
  items: ReadonlyArray<SettingsSearchItem>,
): SettingsSearchItem[] {
  return items
    .filter((item) => !CODE_SETTINGS_SECTIONS.has(item.to) && !CODE_SETTINGS_ROWS.has(item.id))
    .map((item) => {
      const title =
        item.id === "providers"
          ? settingsSectionLabel(item.to, item.title, true)
          : ENGINEERING_SETTINGS_COPY.get(item.id)?.title;
      return title === undefined ? item : { ...item, title };
    });
}
