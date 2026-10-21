import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { CHECK_STATUS } from "./CheckBadge";
import { worstStatus } from "./checkResults";
import { KIND_ICONS, KIND_TINTS } from "./kinds";
import { CARD_GRID, FileCard, MODULE_HEADING, ShowAll } from "./OverviewModules";
import { type FolderPart, PartFooter } from "./PartBadges";
import type { ProjectGroup } from "./projectFiles";
import {
  type FileItem,
  ITEM_TYPES,
  type ItemType,
  itemType,
  projectFileItems,
} from "./projectItems";
import { usePictures } from "./usePictures";

const VIEW_KEY = "studio:everything-view";
/** The list shows this many before "Show all": a screen's worth of rows. */
const FIRST = 24;

function readView(): "list" | "grid" {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

/** A file, as the list shows it. */
interface Item {
  readonly key: string;
  readonly type: ItemType;
  readonly file: FileItem;
}

const capitalize = (text: string) => (text === "" ? text : text[0]!.toUpperCase() + text.slice(1));

const fullPath = (item: FileItem) => `${item.root.replace(/[\\/]+$/, "")}/${item.file.path}`;

/** An item's icon in its kind's color, the way Drive tells a Doc from a Sheet. */
function KindMark(props: { readonly group: ProjectGroup; readonly className: string }) {
  const Icon = KIND_ICONS[props.group];
  return (
    <Icon aria-hidden="true" className={cn("shrink-0", KIND_TINTS[props.group], props.className)} />
  );
}

/** One folder's files as cards, pictured where the server can render them; parts with their badges. */
function FileCards(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly items: ReadonlyArray<FileItem>;
  readonly parts: ReadonlyMap<string, FolderPart>;
  readonly onOpenFile: (root: string, path: string) => void;
}) {
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: props.root,
    paths: props.items
      .filter((item) => !/\.(?:png|jpe?g|webp|gif)$/i.test(item.file.path))
      .map((item) => item.file.picture ?? item.file.path),
  });
  return props.items.map((item) => {
    const part = props.parts.get(fullPath(item));
    return (
      <FileCard
        key={fullPath(item)}
        environmentId={props.environmentId}
        threadRef={props.threadRef}
        root={props.root}
        file={item.file}
        picture={pictures.get(item.file.picture ?? item.file.path)}
        place={undefined}
        onOpen={() => props.onOpenFile(props.root, item.file.path)}
        {...(part === undefined
          ? {}
          : {
              footer: (
                <PartFooter part={part} onOpen={(path) => props.onOpenFile(props.root, path)} />
              ),
            })}
      />
    );
  });
}

/**
 * What a project holds, its assets, in one place, the way Google Drive shows a folder: every kind
 * of file together (CAD, electronics, analysis, manufacturing files, documents, references), each
 * marked by its kind's icon in its kind's color, filtered by type and shown as a list (name, kind,
 * how a part's checks went or where a file is) or as cards with pictures. Its chats are down the
 * left (`StudioSidebar`). A press opens a file beside the chat.
 */
export function ProjectEverything(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly folders: ReadonlyArray<{
    readonly root: string;
    readonly paths: ReadonlyArray<string> | null;
  }>;
  /** The project's parts and boards with their checks, by full path. */
  readonly parts: ReadonlyMap<string, FolderPart>;
  readonly onOpenFile: (root: string, path: string) => void;
}) {
  const [type, setType] = useState<ItemType | "All">("All");
  const [view, setView] = useState<"list" | "grid">(readView);
  const [all, setAll] = useState(false);
  const items = useMemo<Item[]>(
    () =>
      projectFileItems(props.folders).map((file) => ({
        key: fullPath(file),
        type: itemType(file.file.group),
        file,
      })),
    [props.folders],
  );
  const present = ITEM_TYPES.filter((entry) => items.some((item) => item.type === entry));
  const shownType = type !== "All" && present.includes(type) ? type : "All";
  const matching = shownType === "All" ? items : items.filter((item) => item.type === shownType);
  const shown = all ? matching : matching.slice(0, FIRST);
  const chooseView = (next: "list" | "grid") => {
    setView(next);
    try {
      globalThis.localStorage?.setItem(VIEW_KEY, next);
    } catch {
      // Shown this way for this visit.
    }
  };
  const shownFiles = shown.map((item) => item.file);
  const roots = [...new Set(shownFiles.map((item) => item.root))];

  return (
    <section aria-label="Files" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={MODULE_HEADING}>
          Files
          <span className="tabular-nums text-muted-foreground/70">{items.length}</span>
        </h2>
        <div role="group" aria-label="View" className="flex shrink-0 gap-0.5">
          <Button
            variant={view === "list" ? "secondary" : "ghost-muted"}
            size="icon-sm"
            aria-label="Show as a list"
            aria-pressed={view === "list"}
            onClick={() => chooseView("list")}
          >
            <ListIcon />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost-muted"}
            size="icon-sm"
            aria-label="Show as cards"
            aria-pressed={view === "grid"}
            onClick={() => chooseView("grid")}
          >
            <LayoutGridIcon />
          </Button>
        </div>
      </div>
      {present.length < 2 ? null : (
        <ToggleGroup
          aria-label="Type"
          value={[shownType]}
          onValueChange={(next) => {
            const value = next[0];
            if (value === "All" || ITEM_TYPES.includes(value as ItemType)) {
              setType(value as ItemType | "All");
              setAll(false);
            }
          }}
          className="flex-wrap"
        >
          <Toggle value="All">All</Toggle>
          {present.map((entry) => (
            <Toggle key={entry} value={entry}>
              <KindMark group={entry} className="size-3.5" />
              {entry}
            </Toggle>
          ))}
        </ToggleGroup>
      )}

      {items.length === 0 ? (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          No files yet. Use New, or describe what to make in the chat, and what the agent makes
          shows up here.
        </p>
      ) : view === "list" ? (
        <div role="table" aria-label="Files" className="flex flex-col">
          <div
            role="row"
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 border-b border-border px-2 pb-1.5 text-2xs font-medium tracking-wider text-muted-foreground uppercase"
          >
            <span role="columnheader">Name</span>
            <span role="columnheader">Kind</span>
            <span role="columnheader">Details</span>
          </div>
          {shown.map((item) => {
            const { file } = item;
            const part = props.parts.get(fullPath(file));
            const status = part === undefined ? undefined : worstStatus(part.results);
            const details =
              status === undefined
                ? file.file.folder === ""
                  ? "In the project's folder"
                  : `In ${file.file.folder}`
                : status === null
                  ? "Not checked yet"
                  : capitalize(CHECK_STATUS[status].caption);
            return (
              <button
                key={item.key}
                type="button"
                role="row"
                onClick={() => props.onOpenFile(file.root, file.file.path)}
                className="grid h-9 grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 border-b border-border px-2 text-left text-xs outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:bg-accent/60"
              >
                <span role="cell" className="flex min-w-0 items-center gap-2 text-foreground">
                  <KindMark group={file.file.group} className="size-4" />
                  <span className="truncate">{file.label}</span>
                </span>
                <span role="cell" className="truncate text-muted-foreground">
                  {file.file.kind}
                </span>
                <span role="cell" className="truncate text-muted-foreground">
                  {details}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={CARD_GRID}>
          {roots.map((root) => (
            <FileCards
              key={root}
              environmentId={props.environmentId}
              threadRef={props.threadRef}
              root={root}
              items={shownFiles.filter((item) => item.root === root)}
              parts={props.parts}
              onOpenFile={props.onOpenFile}
            />
          ))}
        </div>
      )}
      {matching.length > FIRST ? (
        <ShowAll all={all} count={matching.length} onToggle={() => setAll((value) => !value)} />
      ) : null}
    </section>
  );
}
