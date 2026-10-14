import { LayoutDashboardIcon } from "lucide-react";

import { cn } from "~/lib/utils";

/**
 * The engineering interface's Project tab, pinned at the head of the panel's
 * tabs and set apart from them: the project is home base, where the parts,
 * boards, documents and outputs that open as tabs come from. It cannot be
 * closed or dragged; a press brings the project page back.
 */
export function PinnedProjectTab(props: {
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 pe-1.5" data-pinned-project-tab="">
      <button
        type="button"
        aria-pressed={props.active}
        onClick={props.onSelect}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          props.active
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        <LayoutDashboardIcon className="size-3.5" aria-hidden="true" />
        Project
      </button>
      <span aria-hidden="true" className="h-4 w-px bg-border" />
    </div>
  );
}
