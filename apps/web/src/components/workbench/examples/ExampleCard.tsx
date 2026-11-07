import type { StudioSample } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { KIND_ICONS, KIND_TINT } from "../kinds";
import { LibraryCard } from "../library/LibraryCard";
import { PICTURE_BOX, PictureOrGlyph } from "../library/LibraryPicture";
import { examplePictureOf } from "../library/libraryPictures";

/**
 * An example's picture, bundled with Studio (`examplePictureOf`), in the box the Library's pictures
 * fill; the neutral CAD glyph for one that has none, or while it loads.
 */
export function ExamplePicture(props: { readonly sampleId: string; readonly className?: string }) {
  const url = examplePictureOf(props.sampleId);
  const CadIcon = KIND_ICONS.CAD;
  return (
    <span className={cn(PICTURE_BOX, props.className)}>
      {url === null ? (
        <CadIcon aria-hidden="true" className={cn("size-8 opacity-60", KIND_TINT)} />
      ) : (
        <PictureOrGlyph url={url} icon={CadIcon} />
      )}
    </span>
  );
}

/**
 * An example as a card, as the Library's entries are: its picture, in the shape of a project
 * tile's (`ProjectTile`), its name and what it shows. A press opens its page
 * (`/library/examples/$id`). Home lists these.
 */
export function ExampleCard(props: { readonly sample: StudioSample; readonly onOpen: () => void }) {
  return (
    <LibraryCard
      picture={
        <ExamplePicture
          sampleId={props.sample.id}
          className="aspect-[4/3] border-b border-border"
        />
      }
      name={props.sample.name}
      note={null}
      tags={props.sample.shows}
      onOpen={props.onOpen}
    />
  );
}
