import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  PlusIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ListedProject } from "./projectList";
import { findProjects } from "./recentProjects";
import { useOpenProject } from "./useOpenProject";
import { useProjectCover } from "./useProjectCover";
import { useProjectList } from "./useProjectList";

const rowClass =
  "flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent";

/** A project's picture, small, beside its name: on the switcher itself and in its list. */
function ProjectThumb(props: {
  readonly environmentId: EnvironmentId;
  readonly project: StudioProject | null;
  readonly size?: "sm" | "md";
}) {
  const picture = useProjectCover(props.environmentId, props.project);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50",
        props.size === "sm" ? "size-6" : "size-8",
      )}
    >
      {picture ? (
        <img src={picture} alt="" className="size-full object-contain p-0.5" />
      ) : (
        <LayoutDashboardIcon className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * The project's name in a workspace's top bar, as a CAD tool's document switcher: a control that
 * says it is the project (its picture, "Project" over its name, the up-and-down chevrons every
 * switcher has) and opens the projects, the one worked on last first, each with when, a box to
 * find one by name, then New project and All projects (Home). Picking one opens it where it was
 * left (`useOpenProject`).
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
  useNowMinute();
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
  const current = cards.find(isHere) ?? null;
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
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`Project ${props.title}: switch project`}
                  className="flex h-9 min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-background py-1 ps-1 pe-2 text-left shadow-xs/5 outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[popup-open]:bg-accent"
                />
              }
            />
          }
        >
          <ProjectThumb
            environmentId={props.environmentId}
            project={current?.project ?? null}
            size="sm"
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-3xs leading-3 font-medium tracking-wider text-muted-foreground uppercase">
              Project
            </span>
            <span className="truncate text-sm leading-4 font-semibold text-foreground">
              {props.title}
            </span>
          </span>
          {props.isNew ? (
            <Badge variant="info" size="sm">
              New
            </Badge>
          ) : null}
          <ChevronsUpDownIcon
            className="ms-0.5 size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Switch project</TooltipPopup>
      </Tooltip>
      <PopoverPopup width="md" padding="compact" align="start" initialFocus={input}>
        <p className="px-1 pb-2 text-2xs font-medium tracking-widest text-muted-foreground uppercase">
          Switch project
        </p>
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
              const isOpen = isHere(card);
              return (
                <button
                  key={card.id}
                  type="button"
                  aria-current={isOpen ? "page" : undefined}
                  className={cn(rowClass, isOpen && "bg-accent/60 font-medium")}
                  onClick={() => choose(card)}
                >
                  <ProjectThumb environmentId={props.environmentId} project={card.project} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{card.project.name}</span>
                    <span className="truncate text-2xs font-normal text-muted-foreground">
                      {isOpen ? "Open now" : `Worked on ${formatRelativeTimeLabel(card.latest)}`}
                    </span>
                  </span>
                  {isOpen ? (
                    <CheckIcon className="size-4 shrink-0 text-foreground" aria-hidden="true" />
                  ) : null}
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
            <LayoutGridIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            All projects
          </button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
