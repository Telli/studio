/**
 * The library page's address (`/library`, `LibraryPage`) and its search box. New, the part menus,
 * ⌘K and Settings link into it with `libraryHref`, so none of them imports the page.
 */

import { HARDWARE_ACTIONS } from "../hardwareActions";
import { holdsWords } from "../quickFind";
import {
  findItIn,
  type LibraryDocument,
  type LibraryEntry,
  madeBy,
  showsUpAs,
} from "./libraryCatalog";

/** Where a document type is found: New, or the part menu one of its jobs is in. */
export type LibraryGroup = "New" | "Evaluate" | "Manufacture" | "Document";

/** The document types' groups, in the order the page shows them. */
export const LIBRARY_GROUPS: ReadonlyArray<LibraryGroup> = [
  "New",
  "Evaluate",
  "Manufacture",
  "Document",
];

/**
 * The library's place in the URL: the entry whose detail is open (so Back closes it), the group
 * it opens on, and the page it was opened from, where Make one goes back to.
 */
export interface LibrarySearch {
  readonly entry?: string | undefined;
  readonly group?: LibraryGroup | undefined;
  readonly from?: string | undefined;
}

/** A page of this app other than the library: a path, never another site's address. */
const RETURNABLE = /^\/(?![/\\])(?!library(?:[/?#]|$))/;

/**
 * The library's search as its route reads it from the URL. An unknown group, an entry that is not
 * a name, or a `from` that is not a page of this app is left out, not an error; an entry no one
 * has is ignored by the page. Every key is always set, since the router lays this over the URL's
 * raw search, where a bad value would otherwise show through.
 */
export function validateLibrarySearch(raw: Record<string, unknown>): LibrarySearch {
  return {
    entry: typeof raw.entry === "string" && raw.entry !== "" ? raw.entry : undefined,
    group: LIBRARY_GROUPS.find((group) => group === raw.group),
    from: typeof raw.from === "string" && RETURNABLE.test(raw.from) ? raw.from : undefined,
  };
}

/** A link into the library, for `navigate` or `<Link>`: `libraryHref({ group: "Evaluate", from })`. */
export function libraryHref(input: {
  readonly entry?: string;
  readonly group?: LibraryGroup;
  readonly from?: string;
}) {
  return { to: "/library", search: input } as const;
}

/**
 * The group a document type is listed under, so it shows in one place: the menu of its first job
 * (`actions`), else New.
 */
export function libraryGroup(entry: LibraryDocument): LibraryGroup {
  const first = entry.actions[0];
  return HARDWARE_ACTIONS.find((job) => job.id === first)?.group ?? "New";
}

/** What the search box looks through: an entry's name, what it is, its skills and where it is. */
const searchText = (entry: LibraryEntry) =>
  (entry.kind === "document"
    ? [entry.name, entry.what, ...madeBy(entry), ...findItIn(entry)]
    : [entry.name, entry.displayName, entry.description, ...showsUpAs(entry.name)]
  ).join("\n");

/** The entries that hold every word typed, ignoring case, in their order; all of them for none. */
export function filterLibrary(entries: ReadonlyArray<LibraryEntry>, query: string): LibraryEntry[] {
  return entries.filter((entry) => holdsWords(searchText(entry), query));
}
