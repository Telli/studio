import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, HomeIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import type { ListedProject } from "./projectList";
import { findProjects } from "./recentProjects";
import { useOpenProject } from "./useOpenProject";
import { useProjectCover } from "./useProjectCover";
import { useProjectList } from "./useProjectList";

const rowClass =
  "flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent";

/** A project's picture, small, beside its name in the switcher. */
function ProjectThumb(props: {
  readonly environmentId: EnvironmentId;
  readonly project: StudioProject;
}) {
  const picture = useProjectCover(props.environmentId, props.project);
  return (
    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/50">
      {picture ? (
        <img src={picture} alt="" className="size-full object-contain p-0.5" />
      ) : (
        <LayoutDashboardIcon className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * The project's name in a workspace's top bar, as a CAD tool's document switcher: it opens the
 * projects, the one worked on last first, with a box to find one by name, then New project and
 * Home. Picking one opens it where it was left (`useOpenProject`).
 */
export function ProjectSwitcher(props: {
  readonly environmentId: EnvironmentId;
  /** The workspace's folder: its project is marked open. */
  readonly folder: string | null;
  readonly title: string;
  /** Marked New on its first day. */
  readonly isNew: boolean;
}) {
  const { cards } = useProjectList(props.environmentId);
  const openProject = useOpenProject();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const here = props.folder === null ? null : studioFolderKey(props.folder);
  const shown = findProjects(cards, query);
  const isHere = (card: ListedProject) =>
    here !== null && card.project.folders.some((folder) => studioFolderKey(folder) === here);
  const go = (then: () => void) => {
    setOpen(false);
    setQuery("");
    then();
  };
  const choose = (card: ListedProject) =>
    go(() => {
      if (!isHere(card)) void openProject(card.folder, card.threads);
    });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="min-w-0 max-w-full" />}>
        <span className="truncate text-sm font-semibold">{props.title}</span>
        {props.isNew ? (
          <Badge variant="info" size="sm">
            New
          </Badge>
        ) : null}
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverPopup width="md" padding="compact" align="start" initialFocus={input}>
        <Input
          ref={input}
          size="sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            const first = shown[0];
            if (event.key !== "Enter" || first === undefined) return;
            event.preventDefault();
            choose(first);
          }}
          placeholder="Find a project"
          aria-label="Find a project"
        />
        <div className="mt-2 flex max-h-80 flex-col overflow-y-auto">
          {shown.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No project matches that.</p>
          ) : (
            shown.map((card) => {
              const current = isHere(card);
              return (
                <button
                  key={card.id}
                  type="button"
                  aria-current={current ? "page" : undefined}
                  className={cn(rowClass, current && "bg-accent/60 font-medium")}
                  onClick={() => choose(card)}
                >
                  <ProjectThumb environmentId={props.environmentId} project={card.project} />
                  <span className="min-w-0 flex-1 truncate">{card.project.name}</span>
                  {current ? <span className="text-2xs text-muted-foreground">Open</span> : null}
                </button>
              );
            })
          )}
        </div>
        <div className="mt-1.5 flex flex-col border-t border-border pt-1.5">
          <button
            type="button"
            className={rowClass}
            onClick={() => go(() => void navigate({ to: "/", hash: "start" }))}
          >
            <PlusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            New project
          </button>
          <button
            type="button"
            className={rowClass}
            onClick={() => go(() => void navigate({ to: "/" }))}
          >
            <HomeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            Home
          </button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
