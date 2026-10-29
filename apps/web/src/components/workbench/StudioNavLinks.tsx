import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { HomeIcon, type LucideIcon, SettingsIcon, Trash2Icon } from "lucide-react";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../ui/sidebar";
import { needsYou } from "./recentActivity";
import { railMark } from "./studioPlaces";
import { useProjectList } from "./useProjectList";

/** Where each place's page is. */
type PlacePage = "/" | "/trash" | "/settings";

/**
 * Studio's places, in the sidebar's own column (Amy, 2026-10-29: one Home, not four tabs): Home at
 * its top, with how many chats wait on the person, and Trash and Settings at its foot. Home holds
 * the projects, the examples and the Start box; Cmd+K finds a project, a part or a chat; the
 * Chats, Projects and Library pages stay one link away (Home's All examples, Cmd+K).
 */
export function StudioHomeLink(props: { readonly environmentId: EnvironmentId }) {
  const { cards } = useProjectList(props.environmentId);
  const waiting = new Set(needsYou(cards).map(({ thread }) => thread.id)).size;
  const { mark, go } = usePlaces();
  return (
    <SidebarMenu aria-label="Studio">
      <PlaceItem
        icon={HomeIcon}
        label="Home"
        count={waiting}
        marked={mark === "home"}
        onClick={() => go("/")}
      />
    </SidebarMenu>
  );
}

/** Trash and Settings, at the foot of the column (`StudioHomeLink`). */
export function StudioFootLinks() {
  const { mark, go } = usePlaces();
  return (
    <SidebarMenu aria-label="More">
      <PlaceItem
        icon={Trash2Icon}
        label="Trash"
        marked={mark === "trash"}
        onClick={() => go("/trash")}
      />
      <PlaceItem
        icon={SettingsIcon}
        label="Settings"
        marked={mark === "settings"}
        onClick={() => go("/settings")}
      />
    </SidebarMenu>
  );
}

function usePlaces() {
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const go = (to: PlacePage) => {
    if (isMobile) setOpenMobile(false);
    void navigate({ to });
  };
  return { mark: railMark(pathname), go };
}

function PlaceItem(props: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly marked: boolean;
  readonly count?: number;
  readonly onClick: () => void;
}) {
  const Icon = props.icon;
  const count = props.count ?? 0;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={props.marked}
        aria-current={props.marked ? "page" : undefined}
        aria-label={count > 0 ? `${props.label}, ${count} waiting on you` : props.label}
        onClick={props.onClick}
      >
        <Icon aria-hidden="true" />
        <span className="flex-1">{props.label}</span>
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-3xs font-semibold text-white tabular-nums"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
