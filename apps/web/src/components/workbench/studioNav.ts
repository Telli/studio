/**
 * Which part of Studio a route shows, for the top bar that replaces T3's sidebar in the
 * engineering interface. Home and Projects are Studio's pages and a thread or draft is a project's
 * workspace; every other page (settings, usage, pairing) keeps T3's shell.
 */
export type StudioNavSection = "home" | "projects" | "workspace" | "other";

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
  if (first === "projects" && segments.length === 1) return "projects";
  if (first === "draft" || first === "new") return "workspace";
  if (first !== undefined && T3_PAGES.has(first)) return "other";
  // `/$environmentId/$threadId`, the thread route.
  return segments.length === 2 ? "workspace" : "other";
}
