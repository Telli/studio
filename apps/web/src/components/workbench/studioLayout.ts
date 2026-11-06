/**
 * Studio's one layout rule, on Tailwind's 4px grid, for every page, the Toolbox and Settings:
 *
 * - Frame: `WorkspacePageContainer`, one left edge, one max width and one title position.
 * - Title: `PageTitle`, 24px.
 * - Spacing: `gap-6` (24px) between sections; `gap-3` (12px) between a section's label and its
 *   content and between groups; `gap-2` (8px) between sibling controls and tiles; `p-3` (12px)
 *   inside cards and rows.
 * - Controls: `size="sm"` or `"icon-sm"`, 28px at desktop. A control nested in another one, or in a
 *   line of text, stays smaller.
 * - Corners: `rounded-lg` on cards, tiles, inputs and buttons; `rounded-md` only inside one of them.
 * - Type: title 24px; section label `MODULE_HEADING`; a group within a section `GROUP_LABEL`; body
 *   14px (`text-sm`); secondary 12px (`text-xs`). Nothing smaller but the rail's count.
 */

/** A section's label, on every page and in Settings. */
export const MODULE_HEADING =
  "flex items-baseline gap-2 text-xs font-medium tracking-widest text-muted-foreground uppercase";

/** A group within a section, such as Starred and Recent, or a Toolbox section's tools. */
export const GROUP_LABEL = "text-xs font-medium text-muted-foreground";

/** A section's label over its content, or groups one over the next. */
export const SECTION_STACK = "flex min-w-0 flex-col gap-3";

/** Home's and Projects' tiles, four across on a wide window. */
export const TILE_GRID = "grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4";

/** The card grid every module of files uses, by the width of its `@container`. */
export const CARD_GRID = "grid grid-cols-2 gap-2 @xl:grid-cols-3 @4xl:grid-cols-4";
