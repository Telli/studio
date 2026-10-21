import { StarIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { useStarredStore } from "./starredProjects";

/** Stars a project, or takes its star away, without opening it (`starredProjects.ts`). */
export function StarButton(props: {
  readonly id: string;
  readonly name: string;
  /** Where it sits: over a tile's picture, or at a list row's end. */
  readonly className?: string;
}) {
  const starred = useStarredStore((store) => store.starred.includes(props.id));
  const toggle = useStarredStore((store) => store.toggle);
  return (
    <button
      type="button"
      aria-pressed={starred}
      aria-label={starred ? `Unstar ${props.name}` : `Star ${props.name}`}
      data-starred={starred ? "" : undefined}
      onClick={(event) => {
        event.stopPropagation();
        toggle(props.id);
      }}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        props.className,
      )}
    >
      <StarIcon
        className={cn("size-3.5", starred ? "fill-warning text-warning" : "text-muted-foreground")}
        aria-hidden="true"
      />
    </button>
  );
}
