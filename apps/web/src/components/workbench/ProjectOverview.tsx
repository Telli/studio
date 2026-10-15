import type { EnvironmentId, ScopedProjectRef, ThreadId } from "@t3tools/contracts";
import { studioFolderName } from "@t3tools/shared/studioProjects";
import {
  BoxIcon,
  CircleCheckIcon,
  CircleXIcon,
  CircuitBoardIcon,
  type LucideIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  type CheckIssue,
  type CheckResult,
  type CheckStatus,
  overviewParts,
  proposeFixPrompt,
  resultsFor,
  worstStatus,
} from "./checkResults";
import { humanName, partName } from "./partNames";
import { classifyProjectFile, filePlaces, type ProjectFile } from "./projectFiles";
import { ProjectThreads } from "./ProjectThreads";
import { useEngineeringInterface } from "./studioInterface";
import { usePictures } from "./usePictures";
import { useProjectChecks } from "./useProjectChecks";

const STATUS: Record<
  CheckStatus,
  {
    readonly variant: "error" | "warning" | "success";
    /** How one check went: "Casting fails". */
    readonly word: string;
    /** How a part's checks went: "a check fails". */
    readonly caption: string;
    readonly Icon: LucideIcon;
  }
> = {
  fix: { variant: "error", word: "fails", caption: "a check fails", Icon: CircleXIcon },
  warnings: {
    variant: "warning",
    word: "passes with warnings",
    caption: "checks pass with warnings",
    Icon: TriangleAlertIcon,
  },
  ready: { variant: "success", word: "passes", caption: "checks pass", Icon: CircleCheckIcon },
};
const STATUS_ORDER: Record<CheckStatus | "none", number> = {
  fix: 0,
  warnings: 1,
  ready: 2,
  none: 3,
};
/** The overview shows this many issues, parts per folder, and threads before "Show all". */
const FIRST_ISSUES = 5;
const FIRST_PARTS = 8;
const RECENT_THREADS = 5;

const headingClass =
  "flex items-baseline gap-2 text-2xs font-medium tracking-widest text-muted-foreground uppercase";

interface FolderPart {
  readonly root: string;
  readonly file: ProjectFile;
  readonly results: ReadonlyArray<CheckResult>;
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
function CheckBadge(props: { readonly result: CheckResult; readonly onOpen: () => void }) {
  const { result } = props;
  const { variant, word, Icon } = STATUS[result.status];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={props.onOpen}
            aria-label={`${result.check} ${word}: ${result.headline}. Show the result`}
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
        }
      >
        <Badge variant={variant} size="sm">
          <Icon aria-hidden="true" />
          {result.check}
        </Badge>
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-80">
        {result.headline}
      </TooltipPopup>
    </Tooltip>
  );
}

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
    paths: [part.file.path],
  });
  const picture = pictures.get(part.file.path);
  const status = worstStatus(part.results);
  return (
    <section aria-label="Lead part" className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={props.onOpen}
        aria-label={`Open ${part.file.title} in the viewer`}
        className="flex aspect-[4/3] max-h-80 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50 outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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

function ShowAll(props: {
  readonly all: boolean;
  readonly count: number;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      className="mt-2 self-start text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
    >
      {props.all ? "Show fewer" : `Show all ${props.count}`}
    </button>
  );
}

/** One folder's parts, problems first, each with its checks. */
function FolderParts(props: {
  readonly environmentId: EnvironmentId;
  readonly root: string;
  readonly label: string | null;
  readonly parts: ReadonlyArray<FolderPart>;
  readonly onOpen: (root: string, path: string) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? props.parts : props.parts.slice(0, FIRST_PARTS);
  const engineering = useEngineeringInterface();
  const files = props.parts.map((part) => part.file);
  const places = engineering
    ? filePlaces(files)
    : new Map(files.map((file) => [file.path, file.path] as const));
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: props.root,
    paths: shown.map((part) => part.file.path),
  });
  return (
    <div className="flex min-w-0 flex-col">
      {props.label === null ? null : (
        <h3 className="mt-2 truncate text-xs font-medium text-foreground">{props.label}</h3>
      )}
      <ul className="flex flex-col">
        {shown.map((part) => {
          const picture = pictures.get(part.file.path);
          return (
            <li
              key={part.file.path}
              className="flex min-w-0 items-center gap-3 border-b border-border py-1.5"
            >
              <button
                type="button"
                onClick={() => props.onOpen(props.root, part.file.path)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50">
                  {picture ? (
                    <img src={picture} alt="" className="size-full object-contain p-1" />
                  ) : (
                    <PartIcon file={part.file} className="size-4 text-muted-foreground/60" />
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-medium text-foreground">
                    {part.file.title}
                  </span>
                  <span className="truncate text-2xs text-muted-foreground">
                    {part.file.kind}
                    {places.has(part.file.path) ? ` · ${places.get(part.file.path)}` : ""}
                  </span>
                </span>
              </button>
              <div className="flex max-w-[55%] shrink-0 flex-wrap justify-end gap-1">
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
              </div>
            </li>
          );
        })}
      </ul>
      {props.parts.length > FIRST_PARTS ? (
        <ShowAll all={all} count={props.parts.length} onToggle={() => setAll((value) => !value)} />
      ) : null}
    </div>
  );
}

/**
 * The project's overview, the first thing its page shows: the lead part
 * large, the issues its checks found with the fix each suggests (asking for
 * one writes the ask into the composer: the agent proposes and waits), every
 * part with how its checks went, and the threads worked on lately, any
 * waiting on the person first in mind. Checks are the results text-to-cad
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
        .map((file) => ({ root: folder.root, file, results: resultsFor(file, folder.results) }))
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

  // The lead part is the first folder's first model, as the project files it (not the sort above).
  const lead = useMemo(() => {
    for (const folder of folders) {
      const files = (folder.paths ?? [])
        .map(classifyProjectFile)
        .filter((file): file is ProjectFile => file !== null);
      const file = overviewParts(files)[0];
      if (file !== undefined) {
        return { root: folder.root, file, results: resultsFor(file, folder.results) };
      }
    }
    return null;
  }, [folders]);
  const partCount = byFolder.reduce((total, folder) => total + folder.parts.length, 0);
  const engineering = useEngineeringInterface();

  return (
    <div className="@container flex min-w-0 flex-col gap-8">
      <div className="grid min-w-0 gap-6 @2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {lead === null ? (
          <p className="flex aspect-[4/3] max-h-80 items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-xs text-muted-foreground">
            {reading
              ? "Reading the project"
              : "No parts yet. Describe the part you want in the chat, or add the folder your models are in."}
          </p>
        ) : (
          <LeadPart
            environmentId={props.environmentId}
            part={lead}
            where={engineering ? undefined : lead.file.path}
            onOpen={() => props.onOpen(lead.root, lead.file.path)}
          />
        )}
        <OpenIssues
          issues={issues}
          checked={checked}
          composerRef={props.composerRef}
          linkTo={props.linkTo}
          onShow={(entry) => props.onOpen(entry.root, entry.result.model)}
        />
      </div>

      {partCount === 0 ? null : (
        <section aria-label="Parts and checks" className="flex min-w-0 flex-col">
          <h2 className={headingClass}>
            Parts and checks
            <span className="tabular-nums text-muted-foreground/70">{partCount}</span>
          </h2>
          <div className="mt-1.5 border-t border-border">
            {byFolder.map((folder) =>
              folder.parts.length === 0 ? null : (
                <FolderParts
                  key={folder.root}
                  environmentId={props.environmentId}
                  root={folder.root}
                  label={byFolder.length > 1 ? studioFolderName(folder.root) : null}
                  parts={folder.parts}
                  onOpen={props.onOpen}
                />
              ),
            )}
          </div>
        </section>
      )}

      {props.onShowThreads === null ? null : (
        <section aria-label="Recent work" className="flex min-w-0 flex-col">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className={headingClass}>Recent work</h2>
            <button
              type="button"
              onClick={props.onShowThreads}
              className="text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
            >
              {engineering ? "Full history" : "Every thread"}
            </button>
          </div>
          <div className="mt-1.5">
            <ProjectThreads
              projectRefs={props.projectRefs}
              folderNames={props.folderNames}
              currentThreadId={props.currentThreadId}
              query=""
              limit={RECENT_THREADS}
            />
          </div>
        </section>
      )}
    </div>
  );
}
