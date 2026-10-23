import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { FolderIcon, FolderOpenIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { isElectron } from "~/env";
import { useNowMinute } from "~/hooks/useNowMinute";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { ImportDialogHost } from "./ImportDialog";
import { ImportDropZone } from "./ImportDropZone";
import { ImportMenu } from "./ImportMenu";
import { NewFilesNotice } from "./NewFilesNotice";
import { NewProjectDialog } from "./NewProjectDialog";
import { waitingFirst } from "./ProjectChoices";
import { findProjects } from "./recentProjects";
import { splitStarred, useStarredStore } from "./starredProjects";
import { useEngineeringInterface } from "./studioInterface";
import { StudioNew } from "./StudioNew";
import { StudioTopBar } from "./StudioTopBar";
import { useImportActions } from "./useImportActions";
import { useOpenProject } from "./useOpenProject";
import { useProjectList } from "./useProjectList";
import { useProjectTiles } from "./useProjectTiles";
import { useStartOnce } from "./useStartProject";

/** Starred and Recent, as Home and the project switcher label a group. */
const GROUP_LABEL = "text-xs font-medium text-muted-foreground";
const TILE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4";

const threadCount = (count: number) => (count === 1 ? "1 thread" : `${count} threads`);

function LooseFolderRow(props: {
  readonly folder: EnvironmentProject;
  readonly threads: number;
  readonly onOpen: () => void;
  readonly onMakeProject: () => void;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 border-b border-border">
      <button
        type="button"
        onClick={props.onOpen}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-1 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-xs font-medium text-foreground">{props.folder.title}</span>
        <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
          {props.folder.workspaceRoot}
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
          {threadCount(props.threads)}
        </span>
      </button>
      <Button variant="ghost-muted" size="xs" onClick={props.onMakeProject}>
        Make a project
      </Button>
    </li>
  );
}

/**
 * Studio's Projects page (the rail's Projects), every project, where Home keeps only the starred
 * ones and the last few. A project is a grouping of folders with a brief (`useStudioProjects.ts`):
 * each is a tile as on Home (`useProjectTiles`), the starred ones first, each group with the
 * projects waiting on the person first, then the one worked on last; the box finds one by name,
 * what it is for or a chat's title. Folders in no project are listed below, to open or make a
 * project of. In the engineering interface New and Import add a project as on Home; with code
 * tools on, New project starts one from a kind and any folders.
 */
export function ProjectsHome() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <ProjectsHomeFor environmentId={environmentId} />;
}

function ProjectsHomeFor(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const { list, cards, loose } = useProjectList(environmentId);
  const openProject = useOpenProject();
  const [dialog, setDialog] = useState<{ count: number; open: boolean; folder: string | null }>({
    count: 0,
    open: false,
    folder: null,
  });
  const [query, setQuery] = useState("");
  // Engineering has Studio's top bar and plain words; engineering with code keeps the old header.
  const engineering = useEngineeringInterface();
  // Import replaces Add a folder where the desktop app can read this computer's files.
  const availableImport = useImportActions();
  const importActions = engineering ? availableImport : null;
  useNowMinute();
  const { start } = useStartOnce(environmentId);
  const { tile, dialogs } = useProjectTiles(environmentId, cards);
  const split = splitStarred(
    findProjects(cards, query),
    useStarredStore((store) => store.starred),
  );
  const starred = waitingFirst(split.starred);
  const rest = waitingFirst(split.rest);
  const shown = [...starred, ...rest];

  const openDialog = (folder: string | null) =>
    setDialog((current) => ({ count: current.count + 1, open: true, folder }));

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        {engineering ? (
          <StudioTopBar>
            <div className="w-full max-w-72">
              <Input
                type="search"
                size="sm"
                placeholder="Find a project"
                aria-label="Find a project"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </StudioTopBar>
        ) : (
          <WorkspacePageHeader electron={isElectron} className="border-b border-border">
            <span className="text-sm font-medium text-foreground">Projects</span>
          </WorkspacePageHeader>
        )}
        <ImportDropZone>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
            <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
              {engineering ? <NewFilesNotice environmentId={environmentId} /> : null}
              <div className="flex flex-wrap items-end justify-between gap-3">
                {engineering ? (
                  <h1 className="text-2xl font-semibold text-foreground">
                    Projects{" "}
                    <span className="text-base font-normal text-muted-foreground tabular-nums">
                      {cards.length}
                    </span>
                  </h1>
                ) : (
                  <div>
                    <div className="text-2xs font-medium tracking-widest text-muted-foreground uppercase">
                      Projects
                    </div>
                    <h1 className="mt-1 text-xl font-semibold text-foreground">
                      {cards.length === 1 ? "1 project" : `${cards.length} projects`}
                    </h1>
                    {!list ? null : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Each project is a folder in{" "}
                        <span className="text-foreground select-all">{list.folder}</span>
                        {list.git
                          ? " and its own git repository: every change is a commit, and pushing it shares the project."
                          : ". Install git to give each one its own history."}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {importActions !== null ? (
                    <ImportMenu actions={importActions} />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openCommandPalette({ open: "add-project" })}
                    >
                      <FolderOpenIcon />
                      Add a folder
                    </Button>
                  )}
                  {engineering ? (
                    <StudioNew
                      environmentId={environmentId}
                      cwd=""
                      newProject
                      onCreate={(job) => void start({ kind: "new", job })}
                    />
                  ) : (
                    <Button size="sm" onClick={() => openDialog(null)}>
                      <PlusIcon />
                      New project
                    </Button>
                  )}
                </div>
              </div>
              {shown.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {cards.length === 0
                    ? engineering
                      ? "No projects yet. Start one with New, or Import what you have."
                      : "No projects yet. Start one with New project, or make one of a folder below."
                    : "No project matches that."}
                </p>
              ) : (
                <>
                  {starred.length === 0 ? null : (
                    <>
                      <h2 className={GROUP_LABEL}>Starred</h2>
                      <div className={TILE_GRID}>{starred.map(tile)}</div>
                    </>
                  )}
                  {rest.length === 0 ? null : (
                    <>
                      {starred.length === 0 ? null : <h2 className={GROUP_LABEL}>Recent</h2>}
                      <div className={TILE_GRID}>{rest.map(tile)}</div>
                    </>
                  )}
                </>
              )}
              {importActions === null ? null : (
                <p className="text-center text-xs text-muted-foreground">
                  Drop files or a folder anywhere here to import them.
                </p>
              )}
              {loose.length === 0 ? null : (
                <section aria-label="Folders in no project" className="mt-4">
                  <h2 className="mb-2 text-2xs font-medium tracking-widest text-muted-foreground uppercase">
                    Folders in no project
                  </h2>
                  <ul className="flex flex-col border-t border-border">
                    {loose.map(({ folder, threads: own }) => (
                      <LooseFolderRow
                        key={folder.id}
                        folder={folder}
                        threads={own.length}
                        onOpen={() => void openProject(folder, own)}
                        onMakeProject={() => openDialog(folder.workspaceRoot)}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        </ImportDropZone>
      </div>
      <ImportDialogHost environmentId={environmentId} />
      {dialogs}
      <NewProjectDialog
        key={dialog.count}
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        environmentId={environmentId}
        initialFolder={dialog.folder}
      />
    </SidebarInset>
  );
}
