import { pluginFileHandlers } from "@t3tools/client-runtime/state/plugins";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import {
  ActivityIcon,
  BoxIcon,
  ChevronDownIcon,
  CircuitBoardIcon,
  FileCogIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  LayoutGridIcon,
  ListIcon,
  PackageIcon,
  PencilRulerIcon,
  PlusIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useComposerHandleContext } from "~/composerHandleContext";
import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { pluginAppSurface } from "../plugins/pluginSurfaces";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NewDialog } from "./NewDialog";
import { availableTemplates } from "./newTemplates";
import { ProjectBriefRow } from "./ProjectBrief";
import { ProjectThreads } from "./ProjectThreads";
import { useProjectBrief } from "./useProjectBrief";
import { usePictures } from "./usePictures";
import { groupProjectFiles, type ProjectFile, type ProjectGroup } from "./projectFiles";

const GROUP_ICONS: Record<ProjectGroup, typeof BoxIcon> = {
  Models: BoxIcon,
  "Boards and wiring": CircuitBoardIcon,
  Drawings: PencilRulerIcon,
  Studies: ActivityIcon,
  Manufacturing: FileCogIcon,
  Documents: FileTextIcon,
  Images: ImageIcon,
  "Reference parts": PackageIcon,
  References: FileIcon,
};
/** Groups whose files have pictures: everything the CAD plugin can render. */
const PICTURED: ReadonlySet<ProjectGroup> = new Set([
  "Models",
  "Boards and wiring",
  "Drawings",
  "Studies",
  "Manufacturing",
  "Reference parts",
]);
/** A section shows this many before "Show all". */
const FIRST = 8;
const VIEW_KEY = "studio:project-view";

function readView(): "grid" | "list" {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function FileTile(props: {
  readonly file: ProjectFile;
  readonly picture: string | undefined;
  readonly onOpen: () => void;
}) {
  const { file } = props;
  const Icon = GROUP_ICONS[file.group];
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className="group flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background text-left outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="flex aspect-[4/3] items-center justify-center border-b border-border bg-muted/50">
        {props.picture ? (
          <img src={props.picture} alt="" className="size-full object-contain p-2" />
        ) : (
          <Icon className="size-7 text-muted-foreground/60" aria-hidden="true" />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-xs font-medium text-foreground">{file.name}</span>
        <span className="truncate text-2xs text-muted-foreground">
          {file.kind}
          {file.folder === "" ? "" : ` · ${file.folder}`}
        </span>
      </span>
    </button>
  );
}

function FileRow(props: { readonly file: ProjectFile; readonly onOpen: () => void }) {
  const { file } = props;
  const Icon = GROUP_ICONS[file.group];
  return (
    <button
      type="button"
      onClick={props.onOpen}
      className="grid h-8 w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)] items-center gap-3 border-b border-border px-2 text-left text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate font-medium text-foreground">{file.name}</span>
      </span>
      <span className="truncate">{file.kind}</span>
      <span className="truncate text-muted-foreground/70">{file.folder}</span>
    </button>
  );
}

/** One group of the project: folded or open, its first files and the rest on request. */
function Section(props: {
  readonly group: ProjectGroup;
  readonly files: ReadonlyArray<ProjectFile>;
  readonly view: "grid" | "list";
  readonly pictures: ReadonlyMap<string, string>;
  readonly onOpen: (file: ProjectFile) => void;
}) {
  const [folded, setFolded] = useState(false);
  const [all, setAll] = useState(false);
  const files = all ? props.files : props.files.slice(0, FIRST);
  return (
    <section aria-label={props.group}>
      <h2 className="sticky top-0 z-10 bg-background">
        <button
          type="button"
          aria-expanded={!folded}
          onClick={() => setFolded((value) => !value)}
          className="flex w-full items-center gap-2 py-1.5 text-left text-2xs font-medium tracking-widest text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <ChevronDownIcon
            className={cn("size-3 transition-transform duration-150", folded && "-rotate-90")}
            aria-hidden="true"
          />
          {props.group}
          <span className="tabular-nums text-muted-foreground/70">{props.files.length}</span>
        </button>
      </h2>
      {folded ? null : (
        <>
          {props.view === "grid" ? (
            <div className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2.5">
              {files.map((file) => (
                <FileTile
                  key={file.path}
                  file={file}
                  picture={props.pictures.get(file.path)}
                  onOpen={() => props.onOpen(file)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-1 border-t border-border">
              {files.map((file) => (
                <FileRow key={file.path} file={file} onOpen={() => props.onOpen(file)} />
              ))}
            </div>
          )}
          {props.files.length > FIRST ? (
            <button
              type="button"
              onClick={() => setAll((value) => !value)}
              className="mt-2 text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
            >
              {all ? "Show fewer" : `Show all ${props.files.length}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * The project page, the engineering interface's Project tab (in place of the
 * file explorer): the project's name and brief, then everything it holds,
 * filed as an engineer files it (models, boards, drawings, studies and jobs,
 * documents, fabrication files), each a tile that opens in the viewer or as a
 * document. References are the brief and what it gathered. Source stays in
 * the code interface's explorer.
 */
export function ProjectPage(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly projectName: string;
  /** The project's record; null for a thread's own scratch folder, which has no other threads. */
  readonly projectId: ProjectId | null;
  readonly threadRef: ScopedThreadRef;
  readonly workspaceMutationId: string | null;
}) {
  const { environmentId, cwd, threadRef } = props;
  const [tab, setTab] = useState<"files" | "references" | "threads">("files");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">(readView);
  const [newOpen, setNewOpen] = useState({ open: false, count: 0 });
  const chooseView = (next: "grid" | "list") => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage is off: the choice holds for this page.
    }
  };
  const composerRef = useComposerHandleContext();
  const listing = useEnvironmentQuery(
    projectEnvironment.listEntries({ environmentId, input: { cwd } }),
  );
  useWorkspaceMutationRefresh({
    mutationId: props.workspaceMutationId,
    refresh: listing.refresh,
    resourceKey: `project-page:${cwd}`,
  });
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const { brief } = useProjectBrief(environmentId, cwd);
  const links = (brief?.links ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const paths = useMemo(
    () =>
      (listing.data?.entries ?? [])
        .filter((entry) => entry.kind === "file" && entry.ignored !== true)
        .map((entry) => entry.path),
    [listing.data],
  );
  const groups = useMemo(() => groupProjectFiles(paths, query), [paths, query]);
  const shown = groups.filter(({ group }) =>
    tab === "threads"
      ? false
      : tab === "references"
        ? group === "References"
        : group !== "References",
  );
  const referenceCount = groups.find(({ group }) => group === "References")?.files.length ?? 0;
  const pictures = usePictures({
    environmentId,
    cwd,
    paths: shown.flatMap(({ files }) =>
      files.filter((file) => PICTURED.has(file.group)).map((file) => file.path),
    ),
  });
  const templates = useMemo(
    () =>
      availableTemplates(
        new Set((plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : []))),
      ),
    [plugins],
  );
  // What a template can work from: the project's own models and boards.
  const parts = useMemo(
    () =>
      groupProjectFiles(paths)
        .filter(({ group }) => group === "Models" || group === "Boards and wiring")
        .flatMap(({ files }) => files.map((file) => file.path)),
    [paths],
  );

  const open = (file: ProjectFile) => {
    const panels = useRightPanelStore.getState();
    const viewer = plugins === undefined ? undefined : pluginFileHandlers(plugins, file.path)[0];
    if (viewer !== undefined) panels.openPluginApp(threadRef, pluginAppSurface(viewer, file.path));
    else panels.openFile(threadRef, file.path);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-project-page="">
      <header className="border-b border-border px-5 pt-5 pb-3">
        <div className="text-2xs font-medium tracking-widest text-muted-foreground uppercase">
          Project
        </div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="min-w-0 truncate text-xl font-semibold text-foreground">
            {props.projectName}
          </h1>
          <div className="flex items-center gap-2">
            {templates.length === 0 || composerRef === null ? null : (
              <Button
                size="xs"
                onClick={() => setNewOpen((current) => ({ open: true, count: current.count + 1 }))}
              >
                <PlusIcon />
                New
              </Button>
            )}
            <div role="tablist" aria-label="Project contents" className="flex gap-1">
              {(
                [
                  ["files", "Files"],
                  [
                    "references",
                    referenceCount > 0 ? `References ${referenceCount}` : "References",
                  ],
                  ...(props.projectId === null ? [] : [["threads", "Threads"] as const]),
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    tab === id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {composerRef === null ? null : (
          <ProjectBriefRow environmentId={environmentId} cwd={cwd} composerRef={composerRef} />
        )}
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              tab === "files"
                ? "Find a part, board or document"
                : tab === "threads"
                  ? "Find a thread"
                  : "Find a reference"
            }
            aria-label="Find in the project"
          />
          <div
            role="group"
            aria-label="View"
            className={cn("flex shrink-0 gap-0.5", tab === "threads" && "invisible")}
          >
            <Button
              variant={view === "grid" ? "secondary" : "ghost-muted"}
              size="icon-sm"
              aria-label="Show as tiles"
              aria-pressed={view === "grid"}
              onClick={() => chooseView("grid")}
            >
              <LayoutGridIcon />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost-muted"}
              size="icon-sm"
              aria-label="Show as a list"
              aria-pressed={view === "list"}
              onClick={() => chooseView("list")}
            >
              <ListIcon />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-5 py-4">
        {shown.map(({ group, files }) => (
          <Section
            key={`${tab}:${group}`}
            group={group}
            files={files}
            view={view}
            pictures={pictures}
            onOpen={open}
          />
        ))}
        {tab === "references" && links.length > 0 ? (
          <section aria-label="Links">
            <h2 className="mb-2 text-2xs font-medium tracking-widest text-muted-foreground uppercase">
              Links
            </h2>
            <ul className="flex flex-col border-t border-border">
              {links.map((link) => (
                <li key={link} className="truncate border-b border-border py-1.5 text-xs">
                  {/^https?:\/\//.test(link) ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                      {link}
                    </a>
                  ) : (
                    link
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {tab === "threads" && props.projectId !== null ? (
          <ProjectThreads
            environmentId={environmentId}
            projectId={props.projectId}
            currentThreadId={threadRef.threadId}
            query={query}
          />
        ) : null}
        {tab !== "threads" && shown.length === 0 && !(tab === "references" && links.length > 0) ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {listing.data === undefined
              ? "Reading the project"
              : query.trim() !== ""
                ? "Nothing matches that."
                : tab === "files"
                  ? "Nothing here yet. The models, boards and documents the agent makes show up here."
                  : "No references yet. Add sketches, photos, datasheets or links in the brief."}
          </p>
        ) : null}
      </div>
      {composerRef === null ? null : (
        <NewDialog
          key={newOpen.count}
          open={newOpen.open}
          onOpenChange={(open) => setNewOpen((current) => ({ ...current, open }))}
          environmentId={environmentId}
          cwd={cwd}
          templates={templates}
          initialTemplateId={null}
          parts={parts}
          composerRef={composerRef}
        />
      )}
    </div>
  );
}
