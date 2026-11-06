import type { ReactNode, Ref } from "react";

/** The tags a card names; the rest are counted, so every card stays one line tall. */
const TAGS_SHOWN = 3;

/**
 * A card, as Home's project tiles are: a picture over a name, and a note or tags under it. A press
 * opens what it shows; a disabled one says why in its note. The Library's entries, the Toolbox's
 * groups and the examples (`ExampleCard`, with what each shows as tags) are these. Tags are one
 * quiet line, so the name leads.
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
  const tags = props.tags ?? [];
  const uncounted = tags.length - TAGS_SHOWN;
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
        {tags.length === 0 ? null : (
          <span className="flex min-w-0 gap-1 text-xs text-muted-foreground">
            <span className="truncate">{tags.slice(0, TAGS_SHOWN).join(" · ")}</span>
            {uncounted > 0 ? <span className="shrink-0">+{uncounted}</span> : null}
          </span>
        )}
      </span>
    </button>
  );
}
