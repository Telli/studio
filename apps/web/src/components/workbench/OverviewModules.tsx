import { ChevronDownIcon, type LucideIcon } from "lucide-react";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { cn } from "~/lib/utils";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { workspaceAssetResource } from "../files/filePreviewMode";
import { Button } from "../ui/button";
import { KIND_ICONS } from "./kinds";
import { readmeInline } from "./projectReadme";
import { filePlaces, type ProjectFile, type ProjectGroup } from "./projectFiles";
import { useEngineeringInterface } from "./studioInterface";
import { usePictures } from "./usePictures";

/** A module shows this many files before "Show all": two rows of cards at most widths. */
const FIRST_FILES = 8;
/** Pictures a browser shows as they are; models, boards, results and DXF are rendered (`usePictures`). */
const PHOTO = /\.(?:png|jpe?g|webp|gif)$/i;
/** Documents shown as a page: their title and how they open. */
const PAGE = /\.(?:md|mdx|txt)$/i;

/** The card grid every module of files uses. */
export const CARD_GRID = "grid grid-cols-2 gap-3 @xl:grid-cols-3 @4xl:grid-cols-4";
const FOLDED_KEY = "studio:overview-folded";

export const MODULE_HEADING =
  "flex items-baseline gap-2 text-2xs font-medium tracking-widest text-muted-foreground uppercase";

function readFolded(): Record<string, ReadonlyArray<string>> {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(FOLDED_KEY) ?? "{}") as unknown;
    return stored !== null && typeof stored === "object"
      ? (stored as Record<string, ReadonlyArray<string>>)
      : {};
  } catch {
    return {};
  }
}

/** Which of a project's Overview modules are folded away, remembered on this computer. */
export function useFoldedModules(project: string) {
  const [folded, setFolded] = useState<ReadonlyArray<string>>(() => readFolded()[project] ?? []);
  const toggle = useCallback(
    (module: string) => {
      const next = folded.includes(module)
        ? folded.filter((name) => name !== module)
        : [...folded, module];
      setFolded(next);
      try {
        globalThis.localStorage?.setItem(
          FOLDED_KEY,
          JSON.stringify({ ...readFolded(), [project]: next }),
        );
      } catch {
        // Still folded for this visit.
      }
    },
    [folded, project],
  );
  return { folded, toggle };
}

export function ShowAll(props: {
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

/**
 * One module of a project's Overview: a heading that folds it, how many it holds, and its
 * contents. The Overview shows a module only once there is something in it.
 */
export function OverviewModule(props: {
  readonly title: string;
  /** The kind it holds, as Studio marks that kind everywhere (`kinds.ts`). */
  readonly icon?: LucideIcon;
  readonly count?: number;
  readonly folded: boolean;
  readonly onFold: () => void;
  /** A link at the heading's end, such as Full history. */
  readonly action?: ReactNode;
  /** Across both columns of a wide Overview. */
  readonly wide?: boolean;
  readonly children: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <section
      aria-label={props.title}
      className={cn("flex min-w-0 flex-col", props.wide && "@3xl:col-span-2")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <button
          type="button"
          aria-expanded={!props.folded}
          onClick={props.onFold}
          className={cn(
            MODULE_HEADING,
            "rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          )}
        >
          {Icon === undefined ? null : (
            <Icon aria-hidden="true" className="size-3.5 self-center text-foreground/75" />
          )}
          {props.title}
          {props.count === undefined ? null : (
            <span className="tabular-nums text-muted-foreground/70">{props.count}</span>
          )}
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "size-3 self-center transition-transform duration-150",
              props.folded && "-rotate-90",
            )}
          />
        </button>
        {props.folded ? null : props.action}
      </div>
      {props.folded ? null : (
        <div className="mt-1.5 flex flex-col border-t border-border">{props.children}</div>
      )}
    </section>
  );
}

/** A photo of the project's, by its workspace address; nothing while it loads or if it can't. */
function Photo(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly path: string;
}) {
  const resource = useMemo(
    () =>
      workspaceAssetResource({
        kind: "workspace-file",
        threadRef: props.threadRef,
        draft: true,
        workspaceRoot: props.root,
        absolutePath: `${props.root.replace(/[\\/]+$/, "")}/${props.path}`,
      }),
    [props.threadRef, props.root, props.path],
  );
  const url = useAssetUrlState(props.environmentId, resource);
  const [failed, setFailed] = useState(false);
  if (url._tag !== "Success" || failed) return null;
  return (
    <img src={url.url} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
  );
}

/** Markdown as plain words: links by their names, marks dropped. */
const plainText = (line: string) =>
  readmeInline(line.replace(/^#+\s*/, "").replace(/^[-*]\s+/, ""))
    .map((piece) => piece.text)
    .join("");

/** A document as a small page: its title, then its opening lines, the way a thumbnail reads. */
function Page(props: {
  readonly environmentId: EnvironmentId;
  readonly root: string;
  readonly path: string;
}) {
  const file = useEnvironmentQuery(
    projectEnvironment.readFile({
      environmentId: props.environmentId,
      input: { cwd: props.root, relativePath: props.path },
    }),
  ).data;
  if (!file) return null;
  const lines = file.contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const heading = lines.find((line) => line.startsWith("#"));
  const body = lines
    .filter((line) => line !== heading)
    .slice(0, 8)
    .map(plainText)
    .join(" ");
  return (
    <span className="flex size-full flex-col gap-1 overflow-hidden bg-background px-3 py-2.5 text-left">
      {heading === undefined ? null : (
        <span className="line-clamp-2 text-2xs font-semibold text-foreground">
          {plainText(heading)}
        </span>
      )}
      <span className="line-clamp-6 text-3xs leading-snug text-muted-foreground">{body}</span>
    </span>
  );
}

/**
 * A file as a card: its picture (a render of a model, board, result or DXF, or the photo itself),
 * else its kind's icon large, then its name and what it is. A press opens it.
 */
export function FileCard(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly file: ProjectFile;
  readonly picture: string | undefined;
  /** Where it sits, said only where it tells two alike apart (`filePlaces`). */
  readonly place: string | undefined;
  readonly onOpen: () => void;
  /** Under its name: what was made from it, for a part (its checks, drawing, manufacturing files). */
  readonly footer?: ReactNode;
}) {
  const Icon = KIND_ICONS[props.file.group];
  const photo = PHOTO.test(props.file.path);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <button
        type="button"
        onClick={props.onOpen}
        aria-label={`Open ${props.file.title}`}
        className="flex aspect-[4/3] min-w-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50 outline-none transition-colors duration-150 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {props.picture ? (
          <img src={props.picture} alt="" className="size-full object-contain p-2" />
        ) : PAGE.test(props.file.path) ? (
          <Page environmentId={props.environmentId} root={props.root} path={props.file.path} />
        ) : photo ? (
          <Photo
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            root={props.root}
            path={props.file.path}
          />
        ) : (
          <Icon className="size-8 text-muted-foreground/45" aria-hidden="true" />
        )}
      </button>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium text-foreground">{props.file.title}</span>
        <span className="truncate text-2xs text-muted-foreground">
          {props.file.kind}
          {props.place === undefined ? "" : ` · ${props.place}`}
        </span>
      </div>
      {props.footer}
    </div>
  );
}

/** One folder's files of a module as cards, pictured where the server can render them. */
function FolderCards(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly files: ReadonlyArray<ProjectFile>;
  readonly places: ReadonlyMap<string, string>;
  readonly onOpen: (root: string, path: string) => void;
}) {
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: props.root,
    paths: props.files
      .filter((file) => !PHOTO.test(file.path))
      .map((file) => file.picture ?? file.path),
  });
  return props.files.map((file) => (
    <FileCard
      key={`${props.root}\n${file.path}`}
      environmentId={props.environmentId}
      threadRef={props.threadRef}
      root={props.root}
      file={file}
      picture={pictures.get(file.picture ?? file.path)}
      place={props.places.get(file.path)}
      onOpen={() => props.onOpen(props.root, file.path)}
    />
  ));
}

/** A module of one kind of the project's files, as cards: its drawings, studies, photos, documents. */
export function FilesModule(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly group: ProjectGroup;
  readonly files: ReadonlyArray<{ readonly root: string; readonly file: ProjectFile }>;
  readonly folded: boolean;
  readonly onFold: () => void;
  readonly onOpen: (root: string, path: string) => void;
  /** A link at the heading's end: Documents' New document. */
  readonly action?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? props.files : props.files.slice(0, FIRST_FILES);
  const engineering = useEngineeringInterface();
  const files = props.files.map(({ file }) => file);
  const places = engineering
    ? filePlaces(files)
    : new Map(files.map((file) => [file.path, file.path] as const));
  const roots = [...new Set(shown.map(({ root }) => root))];
  return (
    <OverviewModule
      title={props.group}
      icon={KIND_ICONS[props.group]}
      count={props.files.length}
      folded={props.folded}
      onFold={props.onFold}
      wide
      {...(props.action === undefined ? {} : { action: props.action })}
    >
      <div className={cn(CARD_GRID, "pt-3")}>
        {roots.map((root) => (
          <FolderCards
            key={root}
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            root={root}
            files={shown.filter((entry) => entry.root === root).map(({ file }) => file)}
            places={places}
            onOpen={props.onOpen}
          />
        ))}
      </div>
      {props.files.length > FIRST_FILES ? (
        <ShowAll all={all} count={props.files.length} onToggle={() => setAll((value) => !value)} />
      ) : null}
    </OverviewModule>
  );
}

/** In place of the lead part while the project has none: how to get one, by chat or by hand. */
export function StartModule(props: {
  readonly byHand: boolean;
  readonly onStartPart: (() => void) | null;
}) {
  return (
    <section aria-label="Parts" className="flex min-w-0 flex-col">
      <h2 className={MODULE_HEADING}>Parts</h2>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          {props.byHand
            ? "No part to edit by hand yet. Start one, or describe it in the chat."
            : "No parts yet. Describe the part in the chat and the agent drafts it, or start one by hand."}
        </p>
        {props.onStartPart === null ? null : (
          <Button
            size="xs"
            variant={props.byHand ? "default" : "outline"}
            onClick={props.onStartPart}
          >
            Start a part by hand
          </Button>
        )}
      </div>
    </section>
  );
}
