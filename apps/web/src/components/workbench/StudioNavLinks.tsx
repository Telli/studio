import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { HomeIcon, LibraryBigIcon, type LucideIcon, SettingsIcon, Trash2Icon } from "lucide-react";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../ui/sidebar";
import { useAllChats, waitingChats } from "./allChats";
import { libraryHref } from "./library/librarySearch";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { railMark } from "./studioPlaces";

/** Where each place's page is. */
type PlacePage = "/" | "/trash" | "/settings";

/**
 * Opens the Library, or one of its entries, as the sidebar and ⌘K do: from a project, its Make one
 * comes back there, where its New is.
 */
export function useOpenLibrary() {
  const navigate = useNavigate();
  const router = useRouter();
  const inProject = useOpenWorkspaceStore((store) => store.workspace !== null);
  return (entry?: string) =>
    void navigate(
      libraryHref({
        ...(entry === undefined ? {} : { entry }),
        ...(inProject ? { from: router.state.location.href } : {}),
      }),
    );
}

/**
 * Studio's places, in the sidebar's own column (Amy, 2026-10-29: one Home, not four tabs): Home at
 * its top, with how many chats wait on the person, the Library under it, and Trash and Settings at
 * its foot. Home holds the projects, the examples and the Start box; Cmd+K finds a project, a part
 * or a chat; the Chats and Projects pages stay a link away there. Home's All examples stays: it is
 * that list's own way to the rest of it.
 */
export function StudioHomeLink(props: { readonly environmentId: EnvironmentId }) {
  const waiting = waitingChats(useAllChats(props.environmentId).chats).length;
  const { mark, go, leave } = usePlaces();
  const openLibrary = useOpenLibrary();
  return (
    <SidebarMenu aria-label="Studio">
      <PlaceItem
        icon={HomeIcon}
        label="Home"
        count={waiting}
        marked={mark === "home"}
        onClick={() => go("/")}
      />
      <PlaceItem
        icon={LibraryBigIcon}
        label="Library"
        marked={mark === "library"}
        onClick={() => {
          leave();
          openLibrary();
        }}
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
  const leave = () => {
    if (isMobile) setOpenMobile(false);
  };
  const go = (to: PlacePage) => {
    leave();
    void navigate({ to });
  };
  return { mark: railMark(pathname), go, leave };
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
            className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-semibold text-primary-foreground tabular-nums"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
