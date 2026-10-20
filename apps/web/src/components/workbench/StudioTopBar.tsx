import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { APP_BASE_NAME } from "~/branding";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { T3Wordmark } from "../T3Wordmark";
import { Button } from "../ui/button";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import type { StudioNavSection } from "./studioNav";

/**
 * Studio's mark and name, then Home and Projects: how every engineering page starts its top bar,
 * in place of T3's sidebar. A project's workspace puts its own bar after it.
 */
export function StudioNav(props: { readonly section: StudioNavSection }) {
  return (
    <nav aria-label={APP_BASE_NAME} className="flex shrink-0 items-center gap-1">
      <Link
        to="/"
        className="mr-2 flex items-center gap-1.5 rounded-md text-sm font-semibold text-foreground outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset"
      >
        <T3Wordmark aria-hidden className="h-4 w-auto shrink-0" />
        {APP_BASE_NAME}
      </Link>
      <NavLink to="/" current={props.section === "home"}>
        Home
      </NavLink>
      <NavLink to="/projects" current={props.section === "projects"}>
        Projects
      </NavLink>
    </nav>
  );
}

function NavLink(props: {
  readonly to: "/" | "/projects";
  readonly current: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={props.current ? "secondary" : "ghost"}
      aria-current={props.current ? "page" : undefined}
      render={<Link to={props.to} />}
    >
      {props.children}
    </Button>
  );
}

/** The top bar of Studio's own pages (Home, Projects): the nav, then the page's controls at the end. */
export function StudioTopBar(props: {
  readonly section: StudioNavSection;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <WorkspacePageHeader
      electron={isElectron}
      className={cn("border-b border-border bg-background", props.className)}
    >
      <StudioNav section={props.section} />
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{props.children}</div>
    </WorkspacePageHeader>
  );
}
