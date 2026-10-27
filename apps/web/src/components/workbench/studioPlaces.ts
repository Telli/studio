import { studioNavSection } from "./studioNav";

/**
 * The places on Studio's rail (`StudioRail`), each a page of its own, as Claude's and ChatGPT's
 * sidebars open Chats and Projects: Home, every chat, the projects, the examples Studio ships, what
 * is waiting on the person, Trash, and Settings. The Library is Studio's page as well, so it keeps
 * Studio's shell, but no place on the rail is it: on it, the rail marks nothing.
 */
export type StudioRailMark =
  | "home"
  | "chats"
  | "projects"
  | "examples"
  | "needs"
  | "trash"
  | "library"
  | "settings";

/**
 * What the rail marks: the page that shows, a project's workspace being inside Projects. Null on
 * T3's own pages, which keep T3's shell (`AppSidebarLayout`).
 */
export function railMark(pathname: string): StudioRailMark | null {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  const section = studioNavSection(pathname);
  if (section === "workspace") return "projects";
  return section === "other" ? null : section;
}
