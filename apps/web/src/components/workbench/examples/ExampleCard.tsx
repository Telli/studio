import type { StudioSample } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { KIND_ICONS } from "../kinds";
import { LibraryCard } from "../library/LibraryCard";
import { PICTURE_BOX } from "../library/LibraryPicture";
import { examplePictureOf } from "../library/libraryPictures";

/**
 * An example's picture, bundled with Studio (`examplePictureOf`), in the box the Library's pictures
 * fill; a plain card with the CAD icon for one that has none.
 */
export function ExamplePicture(props: { readonly sampleId: string; readonly className?: string }) {
  const url = examplePictureOf(props.sampleId);
  const CadIcon = KIND_ICONS.CAD;
  return (
    <span className={cn(PICTURE_BOX, props.className)}>
      {url === null ? (
        <CadIcon aria-hidden="true" className="size-8 text-muted-foreground opacity-60" />
      ) : (
        <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      )}
    </span>
  );
}

/**
 * An example as a card, as the Library's entries are: its picture, its name and what it shows. A
 * press opens its page (`/library/examples/$id`). The Library and Home list these.
 */
export function ExampleCard(props: { readonly sample: StudioSample; readonly onOpen: () => void }) {
  return (
    <LibraryCard
      picture={<ExamplePicture sampleId={props.sample.id} className="border-b border-border" />}
      name={props.sample.name}
      note={null}
      tags={props.sample.shows}
      onOpen={props.onOpen}
    />
  );
}
