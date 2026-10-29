/**
 * Which part of Studio a route shows, for the sidebar and the top bar that replace T3's in the
 * engineering interface. Home, Chats (Needs you is its filter), Projects, the Library (with each
 * example's page, `/library/examples/$id`) and Trash are Studio's pages, Home and Trash linked from
 * the sidebar (`StudioNavLinks`) and the rest from Home and Cmd+K; and a thread or draft is a
 * project's workspace. Every other page (settings, usage, pairing) keeps T3's own, though Settings
 * keeps Studio's sidebar around its sections (`studioPlaces`).
 */
export type StudioNavSection =
  | "home"
  | "chats"
  | "projects"
  | "trash"
  | "library"
  | "workspace"
  | "other";

const T3_PAGES = new Set([
  "settings",
  "projects",
  "usage",
  "pull-requests",
  "welcome",
  "pair",
  "connect",
]);

export function studioNavSection(pathname: string): StudioNavSection {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  if (segments.length === 0) return "home";
  const [first] = segments;
  if (segments.length === 1 && first === "chats") return "chats";
  // `/library` and an example's page, `/library/examples/$id`.
  if (first === "library" && (segments.length === 1 || segments[1] === "examples")) {
    return "library";
  }
  if (segments.length === 1 && first === "trash") return "trash";
  if (first === "projects" && segments.length === 1) return "projects";
  if (first === "draft" || first === "new") return "workspace";
  if (first !== undefined && T3_PAGES.has(first)) return "other";
  // `/$environmentId/$threadId`, the thread route.
  return segments.length === 2 ? "workspace" : "other";
}
