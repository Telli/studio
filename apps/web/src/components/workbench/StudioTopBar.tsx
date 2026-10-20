import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { APP_BASE_NAME } from "~/branding";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { T3Wordmark } from "../T3Wordmark";
import { WorkspacePageHeader } from "../WorkspacePageHeader";

/**
 * Studio's mark and name, which always lead Home, the one page of projects: how every engineering
 * page starts its top bar, in place of T3's sidebar. A project's workspace puts its switcher after
 * it (`StudioWorkspaceBar`).
 */
export function StudioNav(props: {
  /** The mark alone, where the bar is narrow (a project's workspace, beside its chat). */
  readonly compact?: boolean;
}) {
  return (
    <nav aria-label={APP_BASE_NAME} className="flex shrink-0 items-center">
      <Link
        to="/"
        aria-label={props.compact ? `${APP_BASE_NAME} home` : undefined}
        className="flex items-center gap-1.5 rounded-md text-sm font-semibold text-foreground outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset"
      >
        <T3Wordmark aria-hidden className="h-4 w-auto shrink-0" />
        {props.compact ? null : APP_BASE_NAME}
      </Link>
    </nav>
  );
}

/** The top bar of Studio's Home: the mark and name, then the page's controls at the end. */
export function StudioTopBar(props: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <WorkspacePageHeader
      electron={isElectron}
      className={cn("border-b border-border bg-background", props.className)}
    >
      <StudioNav />
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{props.children}</div>
    </WorkspacePageHeader>
  );
}
