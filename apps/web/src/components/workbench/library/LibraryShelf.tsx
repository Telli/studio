import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { MODULE_HEADING } from "../studioLayout";

/** Covers along a shelf, by the width of the page's `@container`: one rule for every shelf. */
const SHELF_ROW = "grid grid-cols-2 gap-3 @xl:grid-cols-3 @3xl:grid-cols-4 @4xl:grid-cols-5";

/** A shelf the page lists: what its index and its heading both show. */
export interface Shelf {
  readonly key: string;
  readonly title: string;
  readonly icon: LucideIcon;
  readonly tint: string;
  readonly count: number;
  /** Who it comes from, over its run of shelves in the index. */
  readonly source?: string;
}

/** A shelf's place on the page, which `group` in the URL and the shelf index scroll to. */
export const shelfAnchor = (key: string) => `library-${key}`;

/** One shelf: its title in its hue over a line, then its covers, always open. */
export function LibraryShelf(props: {
  readonly shelf: Shelf;
  /** A line under the title. */
  readonly note?: string;
  readonly children: ReactNode;
}) {
  const { shelf } = props;
  const Icon = shelf.icon;
  return (
    <section
      id={shelfAnchor(shelf.key)}
      aria-label={shelf.title}
      className="flex scroll-mt-6 flex-col gap-3"
    >
      <h2 className={cn(MODULE_HEADING, "items-center border-b border-border pb-2")}>
        <Icon aria-hidden="true" className={cn("size-4 shrink-0", shelf.tint)} />
        <span className="truncate">{shelf.title}</span>
        <span className="tabular-nums">{shelf.count}</span>
      </h2>
      {props.note === undefined ? null : (
        <p className="text-sm text-muted-foreground">{props.note}</p>
      )}
      <div className={SHELF_ROW}>{props.children}</div>
    </section>
  );
}

/**
 * An index of shelves, down a page's side as a library's directory is. A press goes there. The
 * Toolbox does not mount it: its column cost every shelf a cover across.
 */
export function ShelfIndex(props: { readonly shelves: ReadonlyArray<Shelf> }) {
  return (
    <nav
      aria-label="Shelves"
      className="sticky top-0 hidden w-48 shrink-0 flex-col gap-0.5 @3xl:flex"
    >
      {props.shelves.map((shelf, index) => {
        const Icon = shelf.icon;
        const button = (
          <button
            key={shelf.key}
            type="button"
            onClick={() =>
              document.getElementById(shelfAnchor(shelf.key))?.scrollIntoView({ block: "start" })
            }
            className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <Icon aria-hidden="true" className={cn("size-4 shrink-0", shelf.tint)} />
            <span className="min-w-0 flex-1 truncate">{shelf.title}</span>
            <span className="text-xs text-muted-foreground">{shelf.count}</span>
          </button>
        );
        return shelf.source === undefined || shelf.source === props.shelves[index - 1]?.source ? (
          button
        ) : (
          <Fragment key={shelf.key}>
            <p className={cn(MODULE_HEADING, "px-2 py-1.5")}>{shelf.source}</p>
            {button}
          </Fragment>
        );
      })}
    </nav>
  );
}
