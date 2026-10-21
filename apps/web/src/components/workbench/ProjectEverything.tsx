import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { chatStanding } from "./chatStanding";
import { CHECK_STATUS } from "./CheckBadge";
import { worstStatus } from "./checkResults";
import { CHAT_ICON, KIND_ICONS, KIND_TINTS } from "./kinds";
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
import { chatLabel } from "./workspaceTitle";

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

/** A chat or a file, as the list shows it. */
type Item =
  | { readonly key: string; readonly type: "Chats"; readonly chat: EnvironmentThreadShell }
  | { readonly key: string; readonly type: ItemType; readonly file: FileItem };

const capitalize = (text: string) => (text === "" ? text : text[0]!.toUpperCase() + text.slice(1));

const fullPath = (item: FileItem) => `${item.root.replace(/[\\/]+$/, "")}/${item.file.path}`;

/** An item's icon in its kind's color, the way Drive tells a Doc from a Sheet. */
function KindMark(props: { readonly group: ProjectGroup | "Chats"; readonly className: string }) {
  const Icon = props.group === "Chats" ? CHAT_ICON : KIND_ICONS[props.group];
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
 * Everything in a project, in one place, the way Google Drive shows a folder: its chats and every
 * kind of file together, each marked by its kind's icon in its kind's color, filtered by type
 * (All, Chats, CAD, Electronics, Analysis, Manufacturing, Documents, References) and shown as a
 * list (name, kind, and how a chat stands or how a part's checks went) or as cards with pictures.
 * Chats come first, newest first; then files by type and name. A press opens it: a chat in the
 * chat, anything else beside it.
 */
export function ProjectEverything(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly folders: ReadonlyArray<{
    readonly root: string;
    readonly paths: ReadonlyArray<string> | null;
  }>;
  readonly chats: ReadonlyArray<EnvironmentThreadShell>;
  readonly currentThreadId: ThreadId | null;
  /** The project's parts and boards with their checks, by full path. */
  readonly parts: ReadonlyMap<string, FolderPart>;
  readonly onOpenFile: (root: string, path: string) => void;
  readonly onOpenChat: (chat: EnvironmentThreadShell) => void;
}) {
  const [type, setType] = useState<ItemType | "All">("All");
  const [view, setView] = useState<"list" | "grid">(readView);
  const [all, setAll] = useState(false);
  const files = useMemo(() => projectFileItems(props.folders), [props.folders]);
  const items = useMemo<Item[]>(
    () => [
      ...props.chats.map((chat) => ({ key: `chat:${chat.id}`, type: "Chats" as const, chat })),
      ...files.map((file) => ({ key: fullPath(file), type: itemType(file.file.group), file })),
    ],
    [files, props.chats],
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
  const shownFiles = shown.flatMap((item) => ("file" in item ? [item.file] : []));
  const roots = [...new Set(shownFiles.map((item) => item.root))];

  return (
    <section aria-label="Everything in the project" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={MODULE_HEADING}>
          Everything in the project
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
          Nothing here yet. Start a chat or use New, and what the agent makes shows up here.
        </p>
      ) : view === "list" ? (
        <div role="table" aria-label="Everything in the project" className="flex flex-col">
          <div
            role="row"
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 border-b border-border px-2 pb-1.5 text-2xs font-medium tracking-wider text-muted-foreground uppercase"
          >
            <span role="columnheader">Name</span>
            <span role="columnheader">Kind</span>
            <span role="columnheader">Status</span>
          </div>
          {shown.map((item) => {
            if ("chat" in item) {
              const state = chatStanding(item.chat);
              const current = item.chat.id === props.currentThreadId;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="row"
                  onClick={() => props.onOpenChat(item.chat)}
                  className="grid h-9 grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 border-b border-border px-2 text-left text-xs outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:bg-accent/60"
                >
                  <span role="cell" className="flex min-w-0 items-center gap-2 text-foreground">
                    <KindMark group="Chats" className="size-4" />
                    <span className="truncate">{chatLabel(item.chat.title)}</span>
                  </span>
                  <span role="cell" className="truncate text-muted-foreground">
                    {current ? "Chat, open now" : "Chat"}
                  </span>
                  <span role="cell" className={cn("truncate tabular-nums", state.tone)}>
                    {state.text}
                  </span>
                </button>
              );
            }
            const { file } = item;
            const part = props.parts.get(fullPath(file));
            const status = part === undefined ? undefined : worstStatus(part.results);
            const checks =
              status === undefined
                ? null
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
                  {checks ?? file.file.folder}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={CARD_GRID}>
          {shown.map((item) => {
            if (!("chat" in item)) return null;
            const state = chatStanding(item.chat);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => props.onOpenChat(item.chat)}
                className="flex min-w-0 flex-col gap-1.5 text-left outline-none"
              >
                <span className="flex aspect-[4/3] items-center justify-center rounded-md border border-border bg-muted/50 transition-colors duration-150 hover:border-foreground/25">
                  <KindMark group="Chats" className="size-8" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-medium text-foreground">
                    {chatLabel(item.chat.title)}
                  </span>
                  <span className={cn("truncate text-2xs", state.tone)}>Chat · {state.text}</span>
                </span>
              </button>
            );
          })}
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
