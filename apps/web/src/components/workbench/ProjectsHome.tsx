import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { FolderOpenIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { isElectron } from "~/env";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useNowMinute } from "~/hooks/useNowMinute";
import { useProjects, useThreadShells } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { NewProjectDialog } from "./NewProjectDialog";
import { usePictures } from "./usePictures";
import { groupProjectFiles } from "./projectFiles";
import { useProjectBrief } from "./useProjectBrief";

/** The file that pictures a project: its first model, else its first board or drawing. */
const COVER_GROUPS = ["Models", "Boards and wiring", "Drawings", "Studies"] as const;

function ProjectCard(props: {
  readonly project: EnvironmentProject;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onOpen: () => void;
}) {
  const { project } = props;
  const cwd = project.workspaceRoot;
  const listing = useEnvironmentQuery(
    projectEnvironment.listEntries({ environmentId: project.environmentId, input: { cwd } }),
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
  const pictures = usePictures({
    environmentId: project.environmentId,
    cwd,
    paths: cover === null ? [] : [cover],
  });
  const { brief } = useProjectBrief(project.environmentId, cwd);
  const counts = groups
    .filter(({ group }) => group !== "References")
    .slice(0, 3)
    .map(({ group, files }) => `${files.length} ${group.toLowerCase()}`);
  const latest = props.threads.reduce<string | null>(
    (newest, thread) => (newest === null || thread.updatedAt > newest ? thread.updatedAt : newest),
    null,
  );
  const picture = cover === null ? undefined : pictures.get(cover);

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
        <span className="truncate text-sm font-medium text-foreground">{project.title}</span>
        <span className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
          {brief?.purpose.trim() || (counts.length > 0 ? counts.join(", ") : "Nothing in it yet")}
        </span>
        <span className="text-2xs text-muted-foreground/80 tabular-nums">
          {props.threads.length === 1 ? "1 thread" : `${props.threads.length} threads`}
          {latest === null ? "" : ` · ${formatRelativeTimeLabel(latest)}`}
        </span>
      </span>
    </button>
  );
}

/**
 * Studio's Projects page: every project as a card, pictured by its first part,
 * with what it is for and how recently it was worked on, newest first; New
 * project starts one from a template, and an existing folder can be added.
 * Opening one starts a thread in it, on its project page.
 */
export function ProjectsHome() {
  const projects = useProjects();
  const threads = useThreadShells();
  const environmentId = usePrimaryEnvironmentId();
  const handleNewThread = useNewThreadHandler();
  const [newOpen, setNewOpen] = useState(false);
  useNowMinute();

  const cards = useMemo(() => {
    const live = threads.filter((thread) => thread.archivedAt === null);
    return projects
      .filter((project) => project.isScratch !== true)
      .map((project) => {
        const own = live.filter(
          (thread) =>
            thread.environmentId === project.environmentId && thread.projectId === project.id,
        );
        const latest = own.reduce(
          (newest, thread) => (thread.updatedAt > newest ? thread.updatedAt : newest),
          project.createdAt,
        );
        return { project, threads: own, latest };
      })
      .toSorted((a, b) => b.latest.localeCompare(a.latest));
  }, [projects, threads]);

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
                {environmentId === null ? null : (
                  <Button size="sm" onClick={() => setNewOpen(true)}>
                    <PlusIcon />
                    New project
                  </Button>
                )}
              </div>
            </div>
            {cards.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No projects yet. Start one with New project, or add a folder you already have.
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
                {cards.map(({ project, threads: own }) => (
                  <ProjectCard
                    key={`${project.environmentId}:${project.id}`}
                    project={project}
                    threads={own}
                    onOpen={() =>
                      void handleNewThread(scopeProjectRef(project.environmentId, project.id))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {environmentId === null ? null : (
        <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} environmentId={environmentId} />
      )}
    </SidebarInset>
  );
}
