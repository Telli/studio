import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { FolderIcon, FolderOpenIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { isElectron } from "~/env";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useNowMinute } from "~/hooks/useNowMinute";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { NewProjectDialog } from "./NewProjectDialog";
import { groupProjectFiles } from "./projectFiles";
import { usePictures } from "./usePictures";
import { newestOf } from "./projectList";
import { useProjectList } from "./useProjectList";

/** The file that pictures a project: its first folder's first model, else board or drawing. */
const COVER_GROUPS = ["Models", "Boards and wiring", "Drawings", "Studies"] as const;

const threadCount = (count: number) => (count === 1 ? "1 thread" : `${count} threads`);

function ProjectCard(props: {
  readonly environmentId: EnvironmentId;
  readonly project: StudioProject;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onOpen: () => void;
}) {
  const { environmentId, project } = props;
  const cwd = project.folders[0] ?? "";
  const listing = useEnvironmentQuery(
    cwd === "" ? null : projectEnvironment.listEntries({ environmentId, input: { cwd } }),
  );
  const groups = useMemo(
    () =>
      groupProjectFiles(
        (listing.data?.entries ?? [])
          .filter((entry) => entry.kind === "file" && entry.ignored !== true)
          .map((entry) => entry.path),
      ),
    [listing.data],
  );
  const cover =
    COVER_GROUPS.flatMap((group) => groups.find((entry) => entry.group === group)?.files ?? [])[0]
      ?.path ?? null;
  const pictures = usePictures({ environmentId, cwd, paths: cover === null ? [] : [cover] });
  const picture = cover === null ? undefined : pictures.get(cover);
  const latest = props.threads.length === 0 ? null : newestOf(props.threads, "");
  const folders = project.folders.length === 1 ? "1 folder" : `${project.folders.length} folders`;

  return (
    <button
      type="button"
      onClick={props.onOpen}
      className="group flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background text-left outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="flex aspect-[4/3] items-center justify-center border-b border-border bg-muted/50">
        {picture ? (
          <img src={picture} alt="" className="size-full object-contain p-3" />
        ) : (
          <LayoutDashboardIcon className="size-8 text-muted-foreground/50" aria-hidden="true" />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
        <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
        <span className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
          {project.brief.purpose.trim() || "No brief yet"}
        </span>
        <span className="text-2xs text-muted-foreground/80 tabular-nums">
          {folders} · {threadCount(props.threads.length)}
          {latest === null ? "" : ` · ${formatRelativeTimeLabel(latest)}`}
        </span>
      </span>
    </button>
  );
}

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
 * Studio's Projects page. A project is a grouping of folders with a brief
 * (`useStudioProjects.ts`): each is a card pictured by its first part, with
 * what it is for and how recently it was worked on, newest first. Folders in
 * no project are listed below, to open or make a project of. New project
 * starts one from a kind and any folders; opening one starts a thread in its
 * first folder, on its project page.
 */
export function ProjectsHome() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <ProjectsHomeFor environmentId={environmentId} />;
}

function ProjectsHomeFor(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const { list, cards, loose } = useProjectList(environmentId);
  const handleNewThread = useNewThreadHandler();
  const [dialog, setDialog] = useState<{ count: number; open: boolean; folder: string | null }>({
    count: 0,
    open: false,
    folder: null,
  });
  useNowMinute();

  const openDialog = (folder: string | null) =>
    setDialog((current) => ({ count: current.count + 1, open: true, folder }));
  const openFolder = (folder: EnvironmentProject | null) => {
    if (folder !== null) void handleNewThread(scopeProjectRef(folder.environmentId, folder.id));
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border">
          <span className="text-sm font-medium text-foreground">Projects</span>
        </WorkspacePageHeader>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
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
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openCommandPalette({ open: "add-project" })}
                >
                  <FolderOpenIcon />
                  Add a folder
                </Button>
                <Button size="sm" onClick={() => openDialog(null)}>
                  <PlusIcon />
                  New project
                </Button>
              </div>
            </div>
            {cards.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No projects yet. Start one with New project, or make one of a folder below.
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
                {cards.map(({ id, project, folder, threads: own }) => (
                  <ProjectCard
                    key={id}
                    environmentId={environmentId}
                    project={project}
                    threads={own}
                    onOpen={() => openFolder(folder)}
                  />
                ))}
              </div>
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
                      onOpen={() => openFolder(folder)}
                      onMakeProject={() => openDialog(folder.workspaceRoot)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
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
