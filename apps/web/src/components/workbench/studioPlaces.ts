import { studioNavSection } from "./studioNav";

/**
 * Studio's pages, each a place of its own: Home, every chat (and which wait on the person, its Needs
 * you filter), the projects, the Library (the examples Studio ships, its document types and skills),
 * Trash, and Settings. The sidebar links Home, Trash and Settings (`StudioNavLinks`).
 */
export type StudioRailMark = "home" | "chats" | "projects" | "trash" | "library" | "settings";

/**
 * Which place shows: the page, a project's workspace being inside Projects. Null on
 * T3's own pages, which keep T3's shell (`AppSidebarLayout`).
 */
export function railMark(pathname: string): StudioRailMark | null {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  const section = studioNavSection(pathname);
  if (section === "workspace") return "projects";
  return section === "other" ? null : section;
}
