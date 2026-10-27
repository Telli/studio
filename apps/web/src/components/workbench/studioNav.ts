/**
 * Which part of Studio a route shows, for the rail and the top bar that replace T3's sidebar in the
 * engineering interface. Home, Chats, Projects, Examples (with each example's page) and Needs you
 * are Studio's pages, each a place on the rail (`StudioRail`); the Library is Studio's page too,
 * reached from New, the Toolbox, ⌘K and Settings rather than from the rail; and a thread or draft
 * is a project's workspace. Every
 * other page (settings, usage, pairing) keeps T3's own, though Settings keeps the rail beside its
 * sections (`studioPlaces`).
 */
export type StudioNavSection =
  | "home"
  | "chats"
  | "projects"
  | "needs"
  | "examples"
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
  if (segments.length === 1 && first === "needs-you") return "needs";
  if (segments.length === 1 && first === "library") return "library";
  // `/examples` and an example's page, `/examples/$id`, which the thread route would take.
  if (first === "examples" && segments.length <= 2) return "examples";
  if (first === "projects" && segments.length === 1) return "projects";
  if (first === "draft" || first === "new") return "workspace";
  if (first !== undefined && T3_PAGES.has(first)) return "other";
  // `/$environmentId/$threadId`, the thread route.
  return segments.length === 2 ? "workspace" : "other";
}
