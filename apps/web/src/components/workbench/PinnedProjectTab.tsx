import { FileCodeIcon, LayoutDashboardIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import type { ProjectView } from "./projectView";

const VIEWS = [
  { view: "project", label: "Project", Icon: LayoutDashboardIcon },
  { view: "source", label: "Source", Icon: FileCodeIcon },
] as const;

/**
 * The engineering surfaces' Project tab, pinned at the head of the panel's
 * tabs and set apart from them: the project is home base, where the parts,
 * boards, documents and outputs that open as tabs come from. It cannot be
 * closed or dragged; a press brings the project page back. With code tools
 * (`studioInterface.ts`, `both`), Source sits beside it: the same place shown
 * as T3 Code's file explorer, scripts and all.
 */
export function PinnedProjectTab(props: {
  /** Whether the project's surface is the panel's active one. */
  readonly active: boolean;
  readonly view: ProjectView;
  readonly withSource: boolean;
  readonly onSelect: (view: ProjectView) => void;
}) {
  // Alone (the engineering interface), the project's page is its Overview, beside the part tabs.
  const views = props.withSource ? VIEWS : [{ ...VIEWS[0]!, label: "Overview" }];
  return (
    <div className="flex shrink-0 items-center gap-0.5 pe-1.5" data-pinned-project-tab="">
      {views.map(({ view, label, Icon }) => {
        const pressed = props.active && props.view === view;
        return (
          <button
            key={view}
            type="button"
            aria-pressed={pressed}
            onClick={() => props.onSelect(view)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              pressed
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
      <span aria-hidden="true" className="ms-1 h-4 w-px bg-border" />
    </div>
  );
}
