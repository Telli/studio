import type { EnvironmentId } from "@t3tools/contracts";
import { PuzzleIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { KIND_ICONS, KIND_TINTS, templateIcon, templateTint } from "../kinds";
import { DOCUMENT_TEMPLATES, NEW_TEMPLATES } from "../newTemplates";
import { Page, TextPage } from "../OverviewModules";
import type { LibraryDocument, LibraryEntry } from "./libraryCatalog";
import { pictureOf } from "./libraryPictures";

/** The box every picture fills: the pictures' own shape, 16:10. */
const BOX =
  "relative flex aspect-[8/5] flex-col items-center justify-center gap-2 overflow-hidden bg-muted/50";

/** A file's folder and its name in it. */
const folderAndName = (file: string) => {
  const cut = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"));
  return { root: file.slice(0, Math.max(cut, 0)), path: file.slice(cut + 1) };
};

/** A document type's icon, as New shows its first template, or a document's. */
function documentIcon(entry: LibraryDocument) {
  const template = [...NEW_TEMPLATES, ...DOCUMENT_TEMPLATES].find(
    (candidate) => candidate.id === entry.templates[0],
  );
  return template === undefined
    ? { Icon: KIND_ICONS.Documents, tint: KIND_TINTS.Documents }
    : { Icon: templateIcon(template), tint: templateTint(template) };
}

/**
 * An entry's picture of its real example in the sample project (`pictureOf`): the picture rendered
 * from the example's file, or a Markdown example as a page of its own words. One of the person's
 * own templates is its own first page, with the Documents icon until the file is read, and for
 * good if it can't be read as text. An entry with no example (another plugin's skill, or an output
 * the sample could not make) shows its icon and says none ships: a skill its plugin's (the puzzle
 * piece Settings marks plugins with), a document type its template's, as New shows it.
 */
export function LibraryPicture(props: {
  readonly entry: LibraryEntry;
  readonly environmentId: EnvironmentId;
  readonly className?: string;
}) {
  const { entry } = props;
  const picture = pictureOf(entry.id);
  const box = cn(BOX, props.className);
  if (picture?.kind === "image") {
    return (
      <span className={box}>
        {/* The library mounts some forty of these: each loads when it nears the screen. */}
        <img
          src={picture.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      </span>
    );
  }
  if (picture?.kind === "page") {
    return (
      <span className={box}>
        <TextPage text={picture.text} />
      </span>
    );
  }
  const own = entry.kind === "document" ? entry.ownTemplate?.file : undefined;
  if (own !== undefined) {
    const DocumentsIcon = KIND_ICONS.Documents;
    return (
      <span className={box}>
        <DocumentsIcon
          aria-hidden="true"
          className={cn("size-8 opacity-60", KIND_TINTS.Documents)}
        />
        {/* The page covers the icon once the template is read. */}
        <span className="absolute inset-0 flex">
          <Page environmentId={props.environmentId} {...folderAndName(own)} />
        </span>
      </span>
    );
  }
  const { Icon, tint } =
    entry.kind === "skill"
      ? { Icon: PuzzleIcon, tint: "text-muted-foreground" }
      : documentIcon(entry);
  return (
    <span className={box}>
      <Icon aria-hidden="true" className={cn("size-8 opacity-60", tint)} />
      <span className="px-3 text-center text-2xs text-muted-foreground">
        {entry.kind === "skill"
          ? "No example ships with this skill."
          : "No example ships with this document type."}
      </span>
    </span>
  );
}
