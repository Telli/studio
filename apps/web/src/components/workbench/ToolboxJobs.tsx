import { type LucideIcon } from "lucide-react";
import { useId } from "react";

import {
  RICH_TOOLTIP_DELAY,
  Tooltip,
  TooltipPopup,
  TooltipRich,
  TooltipTrigger,
} from "../ui/tooltip";
import type { HardwareAction } from "./hardwareActions";
import type { ToolboxSection } from "./toolbox";
import { GROUP_LABEL } from "./studioLayout";
import { MENU_TINTS } from "./kinds";
import { toolIcon } from "./toolIcons";

/** Two even tiles to a row (`SectionJobs`). */
const TOOL_GRID = "grid grid-cols-2 gap-x-2 gap-y-3";

/**
 * A section's jobs as tool tiles, under its title across the full width, always open like every
 * other. Sections stack (`StudioToolbox`), so a title never takes a tile's place in a row.
 */
export function SectionJobs(props: {
  readonly section: ToolboxSection;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  readonly onRun: (action: HardwareAction) => void;
}) {
  return (
    <section aria-label={props.section.title} className="flex flex-col gap-2">
      <h4 className={GROUP_LABEL}>{props.section.title}</h4>
      <div className={TOOL_GRID}>
        {props.section.actions.map((action) => (
          <ToolTile
            key={action.id}
            action={action}
            icon={toolIcon(action)}
            disabled={props.disabled}
            onRun={() => props.onRun(action)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * A job as a tool to pick up: a square tile, its own picture (`toolIcon`) in its tab's hue over its
 * name in two lines' room, so names of one line and of two sit on the same line across a row. Its name and
 * what it makes show on a pause over it and is the tile's description for readers. A press sends
 * the job (`onRun`).
 */
function ToolTile(props: {
  readonly action: HardwareAction;
  /** Its picture (`toolIcon`). */
  readonly icon: LucideIcon;
  readonly disabled: boolean;
  readonly onRun: () => void;
}) {
  const { action, icon: Icon } = props;
  const describedBy = useId();
  return (
    <Tooltip>
      <TooltipTrigger
        delay={RICH_TOOLTIP_DELAY}
        render={
          <button
            type="button"
            disabled={props.disabled}
            onClick={props.onRun}
            aria-describedby={describedBy}
            className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background p-2 text-center outline-none transition-[border-color,background-color,scale] duration-150 dark:bg-input/32 enabled:hover:border-foreground/25 enabled:hover:bg-accent/50 dark:enabled:hover:bg-input/64 enabled:active:scale-97 enabled:active:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-64 motion-reduce:transition-none motion-reduce:enabled:active:scale-100"
          />
        }
      >
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-md bg-current/10 dark:bg-current/15 ${MENU_TINTS[action.group]}`}
        >
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </span>
        <span className="line-clamp-2 h-[2lh] w-full text-xs leading-tight font-medium text-foreground">
          {action.label}
        </span>
        <span id={describedBy} hidden>
          {action.gets}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="left">
        <TooltipRich title={action.label} description={action.gets} />
      </TooltipPopup>
    </Tooltip>
  );
}
