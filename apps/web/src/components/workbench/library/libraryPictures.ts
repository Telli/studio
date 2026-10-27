/**
 * Each library entry's picture of its real example in the sample project
 * (`studio-sample/servo-bracket`), as `libraryExamples.json` names it: a picture rendered from the
 * example's file by `scripts/studio-library-pictures.py`, or, for a Markdown example, the
 * document's own text, drawn as a page. `LibraryPicture` draws one.
 */

import libraryExamples from "./libraryExamples.json";

export type LibraryPictureSource =
  | { readonly kind: "image"; readonly url: string }
  | { readonly kind: "page"; readonly text: string };

const EXAMPLES: Readonly<
  Record<string, { readonly example: string; readonly picture: string } | null>
> = libraryExamples;

/** The rendered pictures' URLs, by path from this folder. */
const IMAGES = import.meta.glob<string>("./pictures/*.webp", { eager: true, import: "default" });

/**
 * The sample's Markdown, by path from this folder: `SAMPLE`, then its path in the sample. Its
 * READMEs are no entry's example, so they stay out of the bundle.
 */
const PAGES = import.meta.glob<string>(
  ["../../../../../../studio-sample/servo-bracket/**/*.md", "!**/README.md"],
  { eager: true, query: "?raw", import: "default" },
);
const SAMPLE = "../../../../../../studio-sample/servo-bracket/";

/** A picture's file name in `pictures/`: its path in the sample, each "/" as "__", then ".webp". */
export function picturePath(samplePath: string): string {
  return `${samplePath.replaceAll("/", "__")}.webp`;
}

/**
 * An entry's picture, by its id. Null for an entry the sample has no example of (one it could not
 * make, another plugin's skill) and for the person's own templates, which `LibraryPicture` draws
 * from the template itself.
 */
export function pictureOf(entryId: string): LibraryPictureSource | null {
  const item = EXAMPLES[entryId] ?? null;
  if (item === null) return null;
  if (item.picture === "page") {
    const text = PAGES[`${SAMPLE}${item.example}`];
    return text === undefined ? null : { kind: "page", text };
  }
  const url = IMAGES[`./pictures/${picturePath(item.picture)}`];
  return url === undefined ? null : { kind: "image", url };
}

/** The examples' pictures' URLs: `pictures/examples/<id>.png`, or `.webp` at the library's size. */
const EXAMPLE_IMAGES = import.meta.glob<string>("./pictures/examples/*.{png,webp}", {
  eager: true,
  import: "default",
});

/**
 * An example's picture, by its id (`studio-sample/<id>`), bundled here so every client shows it
 * without reading the server's disk. Null for an example with none, which shows a plain card.
 */
export function examplePictureOf(sampleId: string): string | null {
  return (
    EXAMPLE_IMAGES[`./pictures/examples/${sampleId}.webp`] ??
    EXAMPLE_IMAGES[`./pictures/examples/${sampleId}.png`] ??
    null
  );
}
