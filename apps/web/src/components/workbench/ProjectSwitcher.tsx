import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  FolderOpenIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import { serverEnvironment } from "~/state/server";
import { shellEnvironment } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { type ListedProject, lastTouched } from "./projectList";
import { findProjects } from "./recentProjects";
import { StarButton } from "./StarButton";
import { splitStarred, useStarredStore } from "./starredProjects";
import { useDuplicateProject } from "./useDuplicateProject";
import { useOpenProject } from "./useOpenProject";
import { useOpenShortcut } from "./useOpenShortcut";
import { useProjectCover } from "./useProjectCover";
import { useProjectList } from "./useProjectList";
import { useSaveStudioProject } from "./useStudioProjects";
import { useVersionRequestStore } from "./useVersions";

const rowClass =
  "flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent";
const actionClass =
  "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";
const groupClass =
  "px-2 pt-2 pb-1 text-2xs font-medium tracking-widest text-muted-foreground uppercase";

/** The file manager's name where the project's folder opens: Finder on a Mac. */
const folderLabel = (os: string | undefined) =>
  os === "darwin" ? "Show in Finder" : os === "win32" ? "Show in File Explorer" : "Show in Files";

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
 * switcher has), opened by a click or Cmd+O. Its top is the open project's own menu: Rename,
 * Duplicate (a copy with its own folder, `useDuplicateProject`), Version history (the Overview's
 * Versions) and Show in Finder. Below, the projects to switch to: the starred ones, then the rest,
 * the one opened last first, each with when, and a box to find one by name; then New project and
 * All projects (Home). Picking one opens it where it was left (`useOpenProject`).
 */
export function ProjectSwitcher(props: {
  readonly environmentId: EnvironmentId;
  /** The workspace's folder: its project is marked open. */
  readonly folder: string | null;
  readonly title: string;
  /** Marked New on its first day. */
  readonly isNew: boolean;
}) {
  const { environmentId } = props;
  const { cards } = useProjectList(environmentId);
  useNowMinute();
  const openProject = useOpenProject();
  const navigate = useNavigate();
  const save = useSaveStudioProject(environmentId);
  const duplicate = useDuplicateProject(environmentId);
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: true });
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const starredIds = useStarredStore((store) => store.starred);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const openSwitcher = useCallback(() => setOpen(true), []);
  useOpenShortcut(openSwitcher);

  const here = props.folder === null ? null : studioFolderKey(props.folder);
  const isHere = (card: ListedProject) =>
    here !== null && card.project.folders.some((folder) => studioFolderKey(folder) === here);
  const current = cards.find(isHere) ?? null;
  const found = findProjects(cards, query);
  const { starred, rest } = splitStarred(found, starredIds);
  const canShowFolder =
    props.folder !== null && serverConfig?.availableEditors.includes("file-manager") === true;

  const close = () => {
    setOpen(false);
    setQuery("");
    setRenaming(null);
  };
  const go = (then: () => void) => () => {
    close();
    then();
  };
  const choose = (card: ListedProject) =>
    go(() => {
      if (!isHere(card)) void openProject(card.folder, card.threads);
    })();
  const rename = () => {
    if (current === null || renaming === null) return;
    const name = renaming.trim();
    setRenaming(null);
    if (name !== "" && name !== current.project.name) {
      void save(current.id, { ...current.project, name });
    }
  };
  const showVersions = () => {
    const workspace = useOpenWorkspaceStore.getState().workspace;
    if (workspace === null) return;
    useRightPanelStore.getState().open(workspace.threadRef, "files");
    useVersionRequestStore.getState().reveal();
  };
  const showFolder = () => {
    if (props.folder !== null) {
      void openInEditor({ environmentId, input: { cwd: props.folder, editor: "file-manager" } });
    }
  };

  const row = (card: ListedProject) => {
    const isOpen = isHere(card);
    const opened = card.opened !== null && card.opened >= card.latest;
    return (
      <div
        key={card.id}
        className={cn(
          "group/row flex min-w-0 items-center gap-0.5 rounded-md",
          isOpen && "bg-accent/60",
        )}
      >
        <button
          type="button"
          aria-current={isOpen ? "page" : undefined}
          className={cn(rowClass, "flex-1", isOpen && "font-medium")}
          onClick={() => choose(card)}
        >
          <ProjectThumb environmentId={environmentId} project={card.project} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{card.project.name}</span>
            <span className="truncate text-2xs font-normal text-muted-foreground">
              {isOpen
                ? "Open now"
                : `${opened ? "Opened" : "Worked on"} ${formatRelativeTimeLabel(lastTouched(card))}`}
            </span>
          </span>
          {isOpen ? (
            <CheckIcon className="size-4 shrink-0 text-foreground" aria-hidden="true" />
          ) : null}
        </button>
        <StarButton
          id={card.id}
          name={card.project.name}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[starred]:opacity-100"
        />
      </div>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
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
            environmentId={environmentId}
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
        <TooltipPopup side="bottom">Switch project (Cmd+O)</TooltipPopup>
      </Tooltip>
      <PopoverPopup width="md" padding="compact" align="start" initialFocus={input}>
        <section aria-label="This project" className="mb-2 border-b border-border pb-2">
          <div className="flex min-w-0 items-center gap-2.5 px-1 pb-1.5">
            <ProjectThumb environmentId={environmentId} project={current?.project ?? null} />
            {renaming === null ? (
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {props.title}
              </span>
            ) : (
              <Input
                autoFocus
                size="sm"
                value={renaming}
                aria-label="Project name"
                onChange={(event) => setRenaming(event.target.value)}
                onFocus={(event) => event.target.select()}
                onBlur={rename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    rename();
                  } else if (event.key === "Escape") {
                    // Leaves the name as it was, and the switcher open.
                    event.preventDefault();
                    event.stopPropagation();
                    setRenaming(null);
                  }
                }}
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-0.5">
            {current === null ? null : (
              <button
                type="button"
                className={actionClass}
                onClick={() => setRenaming(current.project.name)}
              >
                <PencilIcon aria-hidden="true" />
                Rename
              </button>
            )}
            {current === null || duplicate === null ? null : (
              <button
                type="button"
                className={actionClass}
                onClick={go(
                  () =>
                    void duplicate(
                      current.project,
                      cards.map((card) => card.project.name),
                    ),
                )}
              >
                <CopyIcon aria-hidden="true" />
                Duplicate
              </button>
            )}
            <button type="button" className={actionClass} onClick={go(showVersions)}>
              <HistoryIcon aria-hidden="true" />
              Version history
            </button>
            {canShowFolder ? (
              <button type="button" className={actionClass} onClick={go(showFolder)}>
                <FolderOpenIcon aria-hidden="true" />
                {folderLabel(serverConfig?.environment.platform.os)}
              </button>
            ) : null}
          </div>
        </section>
        <Input
          ref={input}
          size="sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            const first = starred[0] ?? rest[0];
            if (event.key !== "Enter" || first === undefined) return;
            event.preventDefault();
            choose(first);
          }}
          placeholder="Find a project"
          aria-label="Find a project"
        />
        <div className="mt-1 flex max-h-80 flex-col overflow-y-auto">
          {found.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No project matches that.</p>
          ) : (
            <>
              {starred.length === 0 ? null : (
                <>
                  <p className={groupClass}>Starred</p>
                  {starred.map(row)}
                </>
              )}
              {rest.length === 0 ? null : (
                <>
                  {starred.length === 0 ? null : <p className={groupClass}>Recent</p>}
                  {rest.map(row)}
                </>
              )}
            </>
          )}
        </div>
        <div className="mt-1.5 flex flex-col border-t border-border pt-1.5">
          <button
            type="button"
            className={rowClass}
            onClick={go(() => void navigate({ to: "/", hash: "start" }))}
          >
            <PlusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            New project
          </button>
          <button type="button" className={rowClass} onClick={go(() => void navigate({ to: "/" }))}>
            <LayoutGridIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            All projects
          </button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
