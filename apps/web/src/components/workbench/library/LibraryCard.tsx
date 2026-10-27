import type { ReactNode, Ref } from "react";

import { Badge } from "../../ui/badge";

/**
 * A card, as Home's project tiles are: a picture over a name, and a note or tags under it. A press
 * opens what it shows; a disabled one says why in its note. The Library's entries, the Toolbox's
 * groups and the examples (`ExampleCard`, with what each shows as tags) are these.
 */
export function LibraryCard({
  ref,
  ...props
}: {
  /** The picture (`LibraryPicture`); its name says what it is, so it is hidden from readers. */
  readonly picture: ReactNode;
  readonly name: string;
  readonly note: string | null;
  /** Short words under the name: what an example shows. */
  readonly tags?: ReadonlyArray<string>;
  readonly disabled?: boolean;
  readonly onOpen: () => void;
  readonly ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={props.onOpen}
      disabled={props.disabled}
      className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background text-left outline-none transition-colors duration-150 enabled:hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-64"
    >
      {/* A page's words in the picture would be read out as the name. */}
      <span aria-hidden="true" className="flex flex-col">
        {props.picture}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
        <span className="truncate text-sm font-medium text-foreground">{props.name}</span>
        {props.note === null ? null : (
          <span className="truncate text-xs text-muted-foreground">{props.note}</span>
        )}
        {props.tags === undefined || props.tags.length === 0 ? null : (
          <span className="flex flex-wrap gap-1 pt-1">
            {props.tags.map((tag) => (
              <Badge key={tag} variant="outline" size="sm">
                {tag}
              </Badge>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}
