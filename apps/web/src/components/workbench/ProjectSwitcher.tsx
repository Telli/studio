import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronsUpDownIcon,
  CloudUploadIcon,
  CopyIcon,
  FolderOpenIcon,
  HistoryIcon,
  HomeIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { serverEnvironment } from "~/state/server";
import { shellEnvironment } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { showOverview } from "./overviewPanel";
import {
  PROJECT_CONTROL_CLASS,
  PROJECT_ROW_CLASS,
  ProjectChoices,
  ProjectThumb,
} from "./ProjectChoices";
import type { ListedProject } from "./projectList";
import { StarButton } from "./StarButton";
import { BackupDialog } from "./BackupDialog";
import { backupPlaceLabel, useLastBackup } from "./useBackup";
import { useDuplicateProject } from "./useDuplicateProject";
import { useOpenProject } from "./useOpenProject";
import { useOpenShortcut } from "./useOpenShortcut";
import { useProjectHasDesign } from "./useProjectCover";
import { useProjectList } from "./useProjectList";
import { useSaveStudioProject } from "./useStudioProjects";
import { useVersionRequestStore } from "./useVersions";

const actionClass =
  "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";
/** The file manager's name where the project's folder opens: Finder on a Mac. */
const folderLabel = (os: string | undefined) =>
  os === "darwin" ? "Show in Finder" : os === "win32" ? "Show in File Explorer" : "Show in Files";

/**
 * The project's name at the head of its sidebar (`wide`), or in the top bar while the sidebar is
 * folded, as a CAD tool's document switcher: a control that says it is the project on one line
 * (its picture, its name, the up-and-down chevrons every switcher has), opened by a click or
 * Cmd+O. Its top is the open project's own menu: Rename, Duplicate (a copy with its own folder,
 * `useDuplicateProject`), Version history (the Overview's Versions), Back up (into a folder the
 * person chooses once, `useBackup`), Show in Finder and its star. Below, the other projects to
 * switch to: the starred ones, then the rest, the one opened last first, each with when (and its
 * star on hover), and a box to find one by name; then New project and Home.
 * Picking one opens it where it was left (`useOpenProject`).
 */
export function ProjectSwitcher(props: {
  readonly environmentId: EnvironmentId;
  /** The workspace's folder: its project is marked open. */
  readonly folder: string | null;
  readonly title: string;
  /** Across its container, as the head of the project's sidebar. */
  readonly wide?: boolean;
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
  const backup = useLastBackup(current?.id ?? null);
  // Versions are kept of parts: a project with none yet has no history to show.
  const hasDesign = useProjectHasDesign(environmentId, current?.project ?? null);
  const [backingUp, setBackingUp] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Out of Studio, not off the disk: its folder and files stay, to be imported again any time.
  const remove = () => {
    if (current === null) return;
    setRemoving(false);
    void save(current.id, null).then((id) => {
      if (id !== null) void navigate({ to: "/" });
    });
  };
  // The open project is at the top, with its own menu; the list is the others, to switch to.
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
    showOverview(workspace.threadRef);
    useVersionRequestStore.getState().reveal();
  };
  const showFolder = () => {
    if (props.folder !== null) {
      void openInEditor({ environmentId, input: { cwd: props.folder, editor: "file-manager" } });
    }
  };

  return (
    <>
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
                    className={cn(PROJECT_CONTROL_CLASS, props.wide ? "h-11 w-full" : "h-9")}
                  />
                }
              />
            }
          >
            <ProjectThumb
              environmentId={environmentId}
              project={current?.project ?? null}
              size={props.wide ? "md" : "sm"}
            />
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {props.title}
            </span>
            <ChevronsUpDownIcon
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground",
                props.wide ? "ms-auto" : "ms-0.5",
              )}
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
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {props.title}
                  </span>
                  {current === null ? null : (
                    <StarButton id={current.id} name={current.project.name} />
                  )}
                </>
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
              {hasDesign ? (
                <button type="button" className={actionClass} onClick={go(showVersions)}>
                  <HistoryIcon aria-hidden="true" />
                  Version history
                </button>
              ) : null}
              {current === null ? null : (
                <button
                  type="button"
                  className={actionClass}
                  onClick={go(() => setBackingUp(true))}
                >
                  <CloudUploadIcon aria-hidden="true" />
                  Back up…
                </button>
              )}
              {canShowFolder ? (
                <button type="button" className={actionClass} onClick={go(showFolder)}>
                  <FolderOpenIcon aria-hidden="true" />
                  {folderLabel(serverConfig?.environment.platform.os)}
                </button>
              ) : null}
              {current === null ? null : (
                <button type="button" className={actionClass} onClick={go(() => setRemoving(true))}>
                  <Trash2Icon aria-hidden="true" />
                  Remove from Studio…
                </button>
              )}
            </div>
            <p className="px-2 pt-1.5 text-2xs text-muted-foreground">
              {backup.last === null
                ? "Only on this Mac. Back up keeps a copy on GitHub or in a folder that syncs."
                : `Backed up ${formatRelativeTimeLabel(new Date(backup.last.at).toISOString())} to ${backupPlaceLabel(backup.last.place)}.`}
            </p>
          </section>
          <ProjectChoices
            environmentId={environmentId}
            cards={cards}
            leaveOut={isHere}
            onChoose={choose}
            query={query}
            onQueryChange={setQuery}
            inputRef={input}
            none="No other projects yet."
          />
          <div className="mt-1.5 flex flex-col border-t border-border pt-1.5">
            <button
              type="button"
              className={PROJECT_ROW_CLASS}
              onClick={go(() => void navigate({ to: "/", hash: "start" }))}
            >
              <PlusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              New project
            </button>
            <button
              type="button"
              className={PROJECT_ROW_CLASS}
              onClick={go(() => void navigate({ to: "/" }))}
            >
              <HomeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              Home
            </button>
          </div>
        </PopoverPopup>
      </Popover>
      {current === null ? null : (
        <AlertDialog open={removing} onOpenChange={setRemoving}>
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {current.project.name} from Studio</AlertDialogTitle>
              <AlertDialogDescription>
                Its files stay in its folder on this Mac, untouched, and you can import it again any
                time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
              <Button variant="destructive" onClick={remove}>
                Remove
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      )}
      {current === null ? null : (
        <BackupDialog
          open={backingUp}
          onOpenChange={setBackingUp}
          environmentId={environmentId}
          project={{ name: current.project.name, folders: current.project.folders }}
          last={backup.last}
          onBackedUp={backup.remember}
        />
      )}
    </>
  );
}
