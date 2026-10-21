import type {
  EnvironmentId,
  ScopedProjectRef,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { studioFolderName } from "@t3tools/shared/studioProjects";
import {
  BoxIcon,
  CircleXIcon,
  CircuitBoardIcon,
  FileTextIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { CHECK_STATUS as STATUS, CheckBadge } from "./CheckBadge";
import {
  type CheckIssue,
  type CheckResult,
  type CheckStatus,
  drawingsFor,
  overviewParts,
  proposeFixPrompt,
  resultsFor,
  worstStatus,
} from "./checkResults";
import { humanName, partName } from "./partNames";
import { leadPartOf } from "./leadPart";
import {
  CARD_GRID,
  FileCard,
  FilesModule,
  MODULE_HEADING,
  OverviewModule,
  ShowAll,
  StartModule,
  useFoldedModules,
} from "./OverviewModules";
import {
  classifyProjectFile,
  filePlaces,
  groupProjectFiles,
  type ProjectFile,
  type ProjectGroup,
} from "./projectFiles";
import { PartVersions, type VersionedPart } from "./PartVersions";
import { ProjectThreads } from "./ProjectThreads";
import { useEngineeringInterface } from "./studioInterface";
import { usePictures } from "./usePictures";
import { useProjectChecks } from "./useProjectChecks";
import { projectChats } from "./workspaceTitle";

const STATUS_ORDER: Record<CheckStatus | "none", number> = {
  fix: 0,
  warnings: 1,
  ready: 2,
  none: 3,
};
/** The overview shows this many issues and threads before "Show all". */
const FIRST_ISSUES = 5;
const RECENT_THREADS = 5;

const headingClass = MODULE_HEADING;
/** Parts are the Parts and checks module; every other kind of file is a module of its own. */
const PART_GROUPS: ReadonlySet<ProjectGroup> = new Set(["Models", "Boards and wiring"]);

interface FolderPart {
  readonly root: string;
  readonly file: ProjectFile;
  readonly results: ReadonlyArray<CheckResult>;
  /** Its drawing sheets, relative to the folder. */
  readonly drawings: ReadonlyArray<string>;
}

interface Issue {
  readonly root: string;
  readonly result: CheckResult;
  readonly issue: CheckIssue;
  /** The part it was found on, where the folder holds it. */
  readonly part: ProjectFile | null;
}

/** How an issue names its part: the part's own name, else the name its result gives. */
const issuePart = (entry: Issue) =>
  entry.part?.title ?? partName(entry.result.part)?.name ?? humanName(entry.result.part);

/** A part's stand-in until its picture comes: a board or a model. */
function PartIcon(props: { readonly file: ProjectFile; readonly className: string }) {
  return props.file.group === "Boards and wiring" ? (
    <CircuitBoardIcon className={props.className} aria-hidden="true" />
  ) : (
    <BoxIcon className={props.className} aria-hidden="true" />
  );
}

/** A check as a badge: its name, tinted and marked by how it went; it opens the result. */
/** The project's lead part, large: the first model of its first folder. */
function LeadPart(props: {
  readonly environmentId: EnvironmentId;
  readonly part: FolderPart;
  /** Its path, with code tools on. */
  readonly where: string | undefined;
  readonly onOpen: () => void;
}) {
  const { part } = props;
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: part.root,
    paths: [part.file.picture ?? part.file.path],
  });
  const picture = pictures.get(part.file.picture ?? part.file.path);
  const status = worstStatus(part.results);
  return (
    <section aria-label="Lead part" className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={props.onOpen}
        aria-label={`Open ${part.file.title} in the viewer`}
        className="flex aspect-[4/3] max-h-[32rem] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50 outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {picture ? (
          <img src={picture} alt="" className="size-full object-contain p-4" />
        ) : (
          <PartIcon file={part.file} className="size-10 text-muted-foreground/50" />
        )}
      </button>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {part.file.title}
        </span>
        <span className="min-w-0 truncate text-2xs text-muted-foreground">
          {part.file.kind}
          {status === null ? " · not checked yet" : ` · ${STATUS[status].caption}`}
          {props.where === undefined ? "" : ` · ${props.where}`}
        </span>
      </div>
    </section>
  );
}

/** What the checks found, errors first, each with the fix it suggests and a way to ask for one. */
function OpenIssues(props: {
  readonly issues: ReadonlyArray<Issue>;
  readonly checked: boolean;
  readonly composerRef: ComposerHandleRef | null;
  readonly linkTo: (root: string, path: string) => string;
  readonly onShow: (issue: Issue) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? props.issues : props.issues.slice(0, FIRST_ISSUES);
  const propose = (entry: Issue) => {
    const composer = props.composerRef?.current;
    if (!composer) return;
    const part = entry.part === null ? undefined : props.linkTo(entry.root, entry.part.path);
    composer.insertTextAtEnd(proposeFixPrompt(entry.result, entry.issue, part), {
      ensureLeadingBoundary: true,
    });
    composer.focusAtEnd();
  };
  return (
    <section aria-label="Open issues" className="flex min-w-0 flex-col">
      <h2 className={headingClass}>
        Open issues
        {props.issues.length > 0 ? (
          <span className="tabular-nums text-muted-foreground/70">{props.issues.length}</span>
        ) : null}
      </h2>
      {props.issues.length === 0 ? (
        <p className="mt-2 border-t border-border pt-3 text-xs text-muted-foreground">
          {props.checked
            ? "Nothing open. Every check that has run passed."
            : "No checks have run yet. Open a part and use Check to run one."}
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col border-t border-border">
          {shown.map((entry) => {
            const error = entry.issue.severity === "error";
            return (
              <li
                key={`${entry.root}\n${entry.result.path}\n${entry.issue.severity}\n${entry.issue.summary}`}
                className="flex flex-col gap-1.5 border-b border-border py-2.5"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Badge variant={error ? "error" : "warning"} size="sm" className="mt-px">
                    {error ? (
                      <CircleXIcon aria-hidden="true" />
                    ) : (
                      <TriangleAlertIcon aria-hidden="true" />
                    )}
                    {error ? "Fails" : "Warning"}
                  </Badge>
                  <p className="min-w-0 flex-1 text-xs text-foreground">{entry.issue.summary}</p>
                </div>
                <p className="text-2xs text-muted-foreground">
                  {issuePart(entry)} · {entry.result.check}
                </p>
                {entry.issue.fix === null ? null : (
                  <p className="line-clamp-2 text-2xs text-muted-foreground">
                    <span className="text-foreground/80">Suggested fix: </span>
                    {entry.issue.fix}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {props.composerRef === null ? null : (
                    <Button size="xs" variant="outline" onClick={() => propose(entry)}>
                      Propose a fix
                    </Button>
                  )}
                  <Button size="xs" variant="ghost-muted" onClick={() => props.onShow(entry)}>
                    Show the result
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {props.issues.length > FIRST_ISSUES ? (
        <ShowAll all={all} count={props.issues.length} onToggle={() => setAll((value) => !value)} />
      ) : null}
    </section>
  );
}

/** One folder's parts, problems first, each with its checks. */
function FolderParts(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly parts: ReadonlyArray<FolderPart>;
  readonly onOpen: (root: string, path: string) => void;
}) {
  const engineering = useEngineeringInterface();
  const files = props.parts.map((part) => part.file);
  const places = engineering
    ? filePlaces(files)
    : new Map(files.map((file) => [file.path, file.path] as const));
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: props.root,
    paths: props.parts.map((part) => part.file.picture ?? part.file.path),
  });
  return props.parts.map((part) => (
    <FileCard
      key={part.file.path}
      environmentId={props.environmentId}
      threadRef={props.threadRef}
      root={props.root}
      file={part.file}
      picture={pictures.get(part.file.picture ?? part.file.path)}
      place={places.get(part.file.path)}
      onOpen={() => props.onOpen(props.root, part.file.path)}
      footer={
        <div className="flex flex-wrap items-center gap-1">
          {part.results.length === 0 ? (
            <span className="text-2xs text-muted-foreground">Not checked yet</span>
          ) : (
            part.results.map((result) => (
              <CheckBadge
                key={result.path}
                result={result}
                onOpen={() => props.onOpen(props.root, result.model)}
              />
            ))
          )}
          {part.drawings.map((drawing) => (
            <button
              key={drawing}
              type="button"
              onClick={() => props.onOpen(props.root, drawing)}
              aria-label={`Open the drawing of ${part.file.title}`}
              className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <Badge variant="outline" size="sm">
                <FileTextIcon aria-hidden="true" />
                Drawing
              </Badge>
            </button>
          ))}
        </div>
      }
    />
  ));
}

/**
 * The project's overview, the first thing its page shows, made of modules that each appear once
 * the project holds something for them and update as the agent writes files: the lead part large
 * (or, with none yet, how to start one), the issues its checks found with the fix each suggests
 * (asking for one writes the ask into the composer: the agent proposes and waits), every part with
 * how its checks went, a module for each other kind of file (drawings, studies, documents and so
 * on), and the project's other chats. Each module folds away. Checks are the results text-to-cad
 * writes beside the parts (`checkResults.ts`).
 */
export function ProjectOverview(props: {
  readonly environmentId: EnvironmentId;
  readonly folders: ReadonlyArray<string>;
  readonly mutationId: string | null;
  readonly composerRef: ComposerHandleRef | null;
  readonly projectRefs: ReadonlyArray<ScopedProjectRef>;
  readonly folderNames: ReadonlyMap<string, string> | null;
  readonly currentThreadId: ThreadId | null;
  readonly onOpen: (root: string, path: string) => void;
  /** A link to the file, as the composer writes one (a chip naming the part). */
  readonly linkTo: (root: string, path: string) => string;
  /** Opens the Threads tab; null where the page has none (a thread's own scratch folder). */
  readonly onShowThreads: (() => void) | null;
  /** The project's parts open in Edit by hand, so a project with none offers to start one. */
  readonly byHand: boolean;
  /** Starts a blank part to model by hand (`useStartPartByHand`); null where it can't. */
  readonly onStartPart: (() => void) | null;
  /** The thread the Overview is beside, for the project's photos. */
  readonly threadRef: ScopedThreadRef;
  /** The project's README (`ReadmeOverview`), beside the lead part; null where none is shown. */
  readonly readme: ReactNode | null;
  /** How the project's sizes are written ("mm" or "in"), for the sizes a version changed. */
  readonly units: string;
}) {
  const folders = useProjectChecks({
    environmentId: props.environmentId,
    folders: props.folders,
    mutationId: props.mutationId,
  });

  const { byFolder, issues, checked, reading } = useMemo(() => {
    const byFolder = folders.map((folder) => {
      const files = (folder.paths ?? [])
        .map(classifyProjectFile)
        .filter((file): file is ProjectFile => file !== null);
      const parts = overviewParts(files)
        .map((file) => ({
          root: folder.root,
          file,
          results: resultsFor(file, folder.results),
          drawings: drawingsFor(file, folder.paths ?? []),
        }))
        .toSorted(
          (a, b) =>
            STATUS_ORDER[worstStatus(a.results) ?? "none"] -
            STATUS_ORDER[worstStatus(b.results) ?? "none"],
        );
      return { root: folder.root, parts };
    });
    const issues = folders
      .flatMap((folder, index) =>
        folder.results.flatMap((result) => {
          const part =
            byFolder[index]!.parts.find((entry) => entry.results.includes(result))?.file ?? null;
          return result.issues.map((issue) => ({ root: folder.root, result, issue, part }));
        }),
      )
      .toSorted((a, b) =>
        a.issue.severity === b.issue.severity ? 0 : a.issue.severity === "error" ? -1 : 1,
      );
    return {
      byFolder,
      issues,
      checked: folders.some((folder) => folder.results.length > 0),
      reading: folders.some((folder) => folder.paths === null),
    };
  }, [folders]);

  const lead = useMemo(() => {
    const found = leadPartOf(folders);
    const folder = found === null ? undefined : folders.find((entry) => entry.root === found.root);
    if (found === null || folder === undefined) return null;
    return {
      ...found,
      results: resultsFor(found.file, folder.results),
      drawings: drawingsFor(found.file, folder.paths ?? []),
    };
  }, [folders]);
  // Every other kind of file, across the project's folders; the README is read above as itself.
  const modules = useMemo(() => {
    const byGroup = new Map<ProjectGroup, Array<{ root: string; file: ProjectFile }>>();
    for (const folder of folders) {
      for (const { group, files } of groupProjectFiles(folder.paths ?? [])) {
        if (PART_GROUPS.has(group)) continue;
        const kept = files.filter((file) => !/^readme\.md$/i.test(file.path));
        if (kept.length === 0) continue;
        byGroup.set(group, [
          ...(byGroup.get(group) ?? []),
          ...kept.map((file) => ({ root: folder.root, file })),
        ]);
      }
    }
    return [...byGroup];
  }, [folders]);
  const chats = projectChats(useThreadShellsForProjectRefs(props.projectRefs));
  const otherChats = chats.filter((chat) => chat.id !== props.currentThreadId).length;
  // Every part, the lead part first, for its versions.
  const versioned = useMemo(() => {
    const all: VersionedPart[] = byFolder.flatMap((folder) => folder.parts);
    const first =
      lead === null
        ? undefined
        : all.find((entry) => entry.root === lead.root && entry.file.path === lead.file.path);
    const rest = all.filter((entry) => entry !== first);
    return first === undefined ? rest : [first, ...rest];
  }, [byFolder, lead]);
  const { folded, toggle } = useFoldedModules(props.folders[0] ?? "");
  const partCount = byFolder.reduce((total, folder) => total + folder.parts.length, 0);
  const engineering = useEngineeringInterface();

  return (
    <div className="@container flex min-w-0 flex-col gap-8">
      {lead === null ? (
        <>
          {props.readme}
          {reading ? (
            <p className="text-xs text-muted-foreground">Reading the project</p>
          ) : (
            <StartModule byHand={props.byHand} onStartPart={props.onStartPart} />
          )}
        </>
      ) : (
        // The part first, large, with what the project is beside it.
        <div className="grid min-w-0 items-start gap-6 @3xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <LeadPart
            environmentId={props.environmentId}
            part={lead}
            where={engineering ? undefined : lead.file.path}
            onOpen={() => props.onOpen(lead.root, lead.file.path)}
          />
          {props.readme === null ? (
            <OpenIssues
              issues={issues}
              checked={checked}
              composerRef={props.composerRef}
              linkTo={props.linkTo}
              onShow={(entry) => props.onOpen(entry.root, entry.result.model)}
            />
          ) : (
            props.readme
          )}
        </div>
      )}

      {props.readme !== null && (checked || issues.length > 0) ? (
        <OpenIssues
          issues={issues}
          checked={checked}
          composerRef={props.composerRef}
          linkTo={props.linkTo}
          onShow={(entry) => props.onOpen(entry.root, entry.result.model)}
        />
      ) : null}

      <div className="grid min-w-0 gap-8 @3xl:grid-cols-2">
        {versioned.length === 0 ? null : (
          <PartVersions
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            parts={versioned}
            chats={chats}
            units={props.units}
            mutationId={props.mutationId}
            folded={folded.includes("Versions")}
            onFold={() => toggle("Versions")}
            onOpen={props.onOpen}
          />
        )}
        {/* A project of one part shows it above, large; the module is for picking among several. */}
        {partCount < 2 ? null : (
          <OverviewModule
            title="Parts and checks"
            count={partCount}
            wide
            folded={folded.includes("Parts and checks")}
            onFold={() => toggle("Parts and checks")}
          >
            <div className="flex flex-col gap-4 pt-3">
              {byFolder.map((folder) =>
                folder.parts.length === 0 ? null : (
                  <div key={folder.root} className="flex min-w-0 flex-col gap-2">
                    {byFolder.length > 1 ? (
                      <h3 className="truncate text-xs font-medium text-foreground">
                        {studioFolderName(folder.root)}
                      </h3>
                    ) : null}
                    <div className={CARD_GRID}>
                      <FolderParts
                        environmentId={props.environmentId}
                        threadRef={props.threadRef}
                        root={folder.root}
                        parts={folder.parts}
                        onOpen={props.onOpen}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          </OverviewModule>
        )}
        {modules.map(([group, files]) => (
          <FilesModule
            key={group}
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            group={group}
            files={files}
            folded={folded.includes(group)}
            onFold={() => toggle(group)}
            onOpen={props.onOpen}
          />
        ))}
        {props.onShowThreads === null || otherChats === 0 ? null : (
          <OverviewModule
            title="Recent work"
            wide
            folded={folded.includes("Recent work")}
            onFold={() => toggle("Recent work")}
            action={
              <button
                type="button"
                onClick={props.onShowThreads}
                className="text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
              >
                {engineering ? "Full history" : "Every thread"}
              </button>
            }
          >
            <ProjectThreads
              projectRefs={props.projectRefs}
              folderNames={props.folderNames}
              currentThreadId={props.currentThreadId}
              query=""
              limit={RECENT_THREADS}
            />
          </OverviewModule>
        )}
      </div>
    </div>
  );
}
