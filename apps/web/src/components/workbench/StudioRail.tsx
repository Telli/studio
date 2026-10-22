import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  BellIcon,
  FolderIcon,
  HomeIcon,
  type LucideIcon,
  MessagesSquareIcon,
  SettingsIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import { useSidebar } from "../ui/sidebar";
import { needsYou } from "./recentActivity";
import { railMark, type StudioListPlace, useStudioPlaceStore } from "./studioPlaces";
import { useProjectList } from "./useProjectList";

/** The rail's width, which the sidebar keeps when its list folds away (`AppSidebarLayout`). */
export const STUDIO_RAIL_WIDTH = 72;

/**
 * The places down the far left of Studio, as Slack's rail: Home, then the lists the sidebar shows
 * beside it (Chats, Projects, Needs you, with how many chats wait on the person), and Settings at
 * the foot. Picking a list opens it beside the rail; picking the one already open folds it away, as
 * an editor's activity bar does; Home opens Home on its own. The rail stays when the list folds.
 */
export function StudioRail(props: { readonly environmentId: EnvironmentId }) {
  const { isMobile, open, setOpen, setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const list = useStudioPlaceStore((store) => store.list);
  const showList = useStudioPlaceStore((store) => store.showList);
  const { cards } = useProjectList(props.environmentId);
  const waiting = needsYou(cards).length;
  // On a phone the sidebar is a sheet: its list always shows beside the rail.
  const listOpen = isMobile || open;
  const mark = railMark({ pathname, listOpen, list });

  const choose = (place: StudioListPlace) => {
    if (!isMobile && open && list === place) {
      void setOpen(false);
      return;
    }
    showList(place);
    if (!isMobile) void setOpen(true);
  };
  const go = (to: "/" | "/settings") => {
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
        icon={MessagesSquareIcon}
        label="Chats"
        marked={mark === "chats"}
        onClick={() => choose("chats")}
      />
      <RailItem
        icon={FolderIcon}
        label="Projects"
        marked={mark === "projects"}
        onClick={() => choose("projects")}
      />
      <RailItem
        icon={BellIcon}
        label="Needs you"
        count={waiting}
        marked={mark === "needs"}
        onClick={() => choose("needs")}
      />
      <div className="flex-1" />
      <RailItem
        icon={SettingsIcon}
        label="Settings"
        marked={mark === "settings"}
        onClick={() => go("/settings")}
      />
    </nav>
  );
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
