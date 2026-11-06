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
import { KIND_TINT } from "./kinds";
import { toolIcon } from "./toolIcons";

/** The grid every section of a tab flows into, two even tiles to a row (`SectionJobs`). */
export const TOOL_GRID = "grid grid-cols-2 gap-x-2 gap-y-3";

/**
 * A section's jobs as tool tiles, flowing into the tab's one grid (`TOOL_GRID`), with its title over
 * its first tile, always open like every other. Each tile keeps its cell's width, and sits at its
 * row's foot, so a row with a title in one cell still lines its tiles up.
 */
export function SectionJobs(props: {
  readonly section: ToolboxSection;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  readonly onRun: (action: HardwareAction) => void;
}) {
  return (
    <section aria-label={props.section.title} className="contents">
      {props.section.actions.map((action, index) => (
        <div key={action.id} className="flex min-w-0 flex-col justify-end gap-2">
          {index === 0 ? (
            <h4 className={`${GROUP_LABEL} truncate`}>{props.section.title}</h4>
          ) : null}
          <ToolTile
            action={action}
            icon={toolIcon(action)}
            disabled={props.disabled}
            onRun={() => props.onRun(action)}
          />
        </div>
      ))}
    </section>
  );
}

/**
 * A job as a tool to pick up: a low flat tile, its own picture (`toolIcon`) over its name in two
 * lines' room, so names of one line and of two sit on the same line across a row. Its name and
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
            className="flex h-15 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background px-2 text-center outline-none transition-[border-color,background-color,scale] duration-150 dark:bg-input/32 enabled:hover:border-foreground/25 enabled:hover:bg-accent/50 dark:enabled:hover:bg-input/64 enabled:active:scale-97 enabled:active:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-64 motion-reduce:transition-none motion-reduce:enabled:active:scale-100"
          />
        }
      >
        <Icon aria-hidden="true" className={`size-5 shrink-0 ${KIND_TINT}`} strokeWidth={1.75} />
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
