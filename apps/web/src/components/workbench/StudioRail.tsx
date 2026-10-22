import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { BellIcon, FolderIcon, HomeIcon, type LucideIcon, SettingsIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { useDesktopUpdateState } from "~/state/desktopUpdate";
import { resolveDesktopUpdateButtonAction } from "../desktopUpdate.logic";
import { SidebarUpdatePill } from "../sidebar/SidebarUpdatePill";
import { useSidebar } from "../ui/sidebar";
import { CHAT_ICON } from "./kinds";
import { needsYou } from "./recentActivity";
import { railMark } from "./studioPlaces";
import { useProjectList } from "./useProjectList";

/** The rail's width, which the sidebar keeps when its list folds away (`AppSidebarLayout`). */
export const STUDIO_RAIL_WIDTH = 72;

/** Where each place's page is. */
type RailPage = "/" | "/chats" | "/projects" | "/needs-you" | "/settings";

/**
 * The places down the far left of Studio, as Slack's rail, each opening its own page as Claude's
 * and ChatGPT's sidebars open Chats and Projects: Home, Chats (every chat), Projects, Needs you
 * (the chats waiting on the person, with how many), and Settings at the foot. The one that shows
 * is marked; inside a project, Projects is. The rail stays when the list beside it folds, and then
 * carries the update button above Settings while an update waits (`RailUpdate`).
 */
export function StudioRail(props: { readonly environmentId: EnvironmentId }) {
  const { isMobile, open, setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const { cards } = useProjectList(props.environmentId);
  const waiting = needsYou(cards).length;
  const mark = railMark(pathname);
  const go = (to: RailPage) => {
    if (isMobile) setOpenMobile(false);
    void navigate({ to });
  };

  return (
    <nav
      aria-label="Studio"
      className="flex h-full shrink-0 flex-col items-center gap-1 pt-1 pb-3"
      style={{ width: STUDIO_RAIL_WIDTH }}
    >
      <RailItem icon={HomeIcon} label="Home" marked={mark === "home"} onClick={() => go("/")} />
      <RailItem
        icon={CHAT_ICON}
        label="Chats"
        marked={mark === "chats"}
        onClick={() => go("/chats")}
      />
      <RailItem
        icon={FolderIcon}
        label="Projects"
        marked={mark === "projects"}
        onClick={() => go("/projects")}
      />
      <RailItem
        icon={BellIcon}
        label="Needs you"
        count={waiting}
        marked={mark === "needs"}
        onClick={() => go("/needs-you")}
      />
      <div className="flex-1" />
      {open || isMobile ? null : <RailUpdate />}
      <RailItem
        icon={SettingsIcon}
        label="Settings"
        marked={mark === "settings"}
        onClick={() => go("/settings")}
      />
    </nav>
  );
}

/**
 * The update button (`SidebarUpdatePill`) on the rail while the list beside it is folded away, as
 * the project switcher moves to the top bar: the list's foot holds it otherwise. It shows only when
 * there is an update to download or restart into, since nothing else says one is out.
 */
function RailUpdate() {
  const state = useDesktopUpdateState();
  const waiting =
    state !== null &&
    (state.status === "downloading" || resolveDesktopUpdateButtonAction(state) !== "none");
  return waiting ? (
    <ul aria-label="Update" className="flex w-fit pb-1">
      <SidebarUpdatePill />
    </ul>
  ) : null;
}

function RailItem(props: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly marked: boolean;
  readonly count?: number;
  readonly onClick: () => void;
}) {
  const Icon = props.icon;
  const count = props.count ?? 0;
  return (
    <button
      type="button"
      aria-current={props.marked ? "page" : undefined}
      aria-label={count > 0 ? `${props.label}, ${count} waiting` : props.label}
      onClick={props.onClick}
      className="group/rail flex w-16 flex-col items-center gap-1 rounded-lg py-1.5 text-sidebar-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span
        className={cn(
          "relative flex h-8 w-10 items-center justify-center rounded-lg transition-colors duration-150",
          props.marked
            ? "bg-sidebar-row-selected text-sidebar-foreground shadow-xs/5"
            : "group-hover/rail:bg-sidebar-row-hover group-hover/rail:text-sidebar-foreground",
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-3xs font-semibold text-white tabular-nums"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "text-2xs leading-none font-medium",
          props.marked ? "text-sidebar-foreground" : null,
        )}
      >
        {props.label}
      </span>
    </button>
  );
}
