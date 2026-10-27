import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import { useId } from "react";

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { HardwareAction } from "./hardwareActions";
import { MENU_TINTS } from "./kinds";
import type { ToolboxSection } from "./toolbox";
import { toolIcon } from "./toolIcons";

/** A section's title over its jobs as tool tiles, two to a row; a folded one opens in place. */
export function SectionJobs(props: {
  readonly section: ToolboxSection;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  readonly onRun: (action: HardwareAction) => void;
}) {
  return (
    <Collapsible defaultOpen={!props.section.folded}>
      <CollapsibleTrigger className="group flex h-7 w-full items-center gap-1 rounded-md px-2 text-left text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className="min-w-0 flex-1 truncate">{props.section.title}</span>
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform duration-150 group-data-panel-open:rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="grid grid-cols-2 gap-1.5 px-1 pb-2">
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
      </CollapsiblePanel>
    </Collapsible>
  );
}

/**
 * A job as a tool to pick up: a square raised tile, its own picture (`toolIcon`) large in its
 * group's color over its name. What it makes shows on hover and is the tile's description for
 * readers. A press sends the job (`onRun`).
 */
function ToolTile(props: {
  readonly action: HardwareAction;
  /** Its picture (`toolIcon`). */
  readonly icon: LucideIcon;
  readonly disabled: boolean;
  readonly onRun: () => void;
}) {
  const { action, icon: Icon } = props;
  const tint = MENU_TINTS[action.group];
  const describedBy = useId();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={props.disabled}
            onClick={props.onRun}
            aria-describedby={describedBy}
            className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background p-2 text-center shadow-xs outline-none transition-[border-color,background-color,box-shadow,scale] duration-150 dark:bg-input/32 enabled:hover:border-foreground/25 enabled:hover:bg-accent/50 dark:enabled:hover:bg-input/64 enabled:active:scale-97 enabled:active:bg-accent enabled:active:shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-64 motion-reduce:transition-none motion-reduce:enabled:active:scale-100"
          />
        }
      >
        <span
          aria-hidden="true"
          className={`flex size-11 shrink-0 items-center justify-center rounded-md bg-current/10 dark:bg-current/15 ${tint}`}
        >
          <Icon className="size-7" strokeWidth={1.75} />
        </span>
        <span className="line-clamp-2 text-xs leading-tight font-medium text-foreground">
          {action.label}
        </span>
        <span id={describedBy} hidden>
          {action.gets}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="left">{action.gets}</TooltipPopup>
    </Tooltip>
  );
}
