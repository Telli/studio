import { studioNavSection } from "./studioNav";

/**
 * The places on Studio's rail (`StudioRail`), each a page of its own, as Claude's and ChatGPT's
 * sidebars open Chats and Projects: Home, every chat, the projects, what is waiting on the person,
 * and Settings.
 */
export type StudioRailMark = "home" | "chats" | "projects" | "needs" | "settings";

/** What the rail marks: the page that shows, a project's workspace being inside Projects. */
export function railMark(pathname: string): StudioRailMark | null {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  const section = studioNavSection(pathname);
  if (section === "workspace") return "projects";
  return section === "other" ? null : section;
}
