import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  type LucideIcon,
} from "lucide-react";
import {
  lazy,
  type RefObject,
  Suspense,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useNavigate, useRouter } from "@tanstack/react-router";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { observeResize } from "~/lib/observeResize";
import { Button } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { HardwareAction, HardwareActionGroup } from "./hardwareActions";
import { MENU_ICONS, MENU_TINTS } from "./kinds";
import { LibraryCard } from "./library/LibraryCard";
import { LIBRARY_DOCUMENTS } from "./library/libraryCatalog";
import { handToChat } from "./handToChat";
import { toolIcon } from "./toolIcons";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { usePartInFront } from "./StudioPanelBar";
import {
  jobCount,
  readToolboxFolded,
  TOOLBOX_NARROW_REM,
  type ToolboxGroup,
  type ToolboxSection,
  toolboxFolded,
  toolboxGroups,
  toolboxLibraryLink,
  toolboxView,
  writeToolboxFolded,
} from "./toolbox";
import { usePartJobs } from "./usePartJobs";

/**
 * A group's picture, as the library pictures its entry. Loaded the first time the Toolbox shows
 * its groups, since it brings the sample project's pictures and pages with it (as New does).
 */
const LibraryPicture = lazy(() =>
  import("./library/LibraryPicture").then((module) => ({ default: module.LibraryPicture })),
);

/** The box a picture fills while it loads: the pictures' own shape. */
const PICTURE_BOX = "aspect-[8/5] border-b border-border bg-muted/50";

/** "1 job", "12 jobs". */
const jobsNote = (count: number) => (count === 1 ? "1 job" : `${count} jobs`);

/**
 * The Toolbox, down the right of the workspace panel beside the part, the same in AI and CAD: the
 * part's jobs (`usePartJobs`) as Evaluate, Manufacture and Document (`toolboxGroups`). It opens on
 * the three groups, each a card with its Library picture and how many jobs it has; a press slides
 * in that group's sections, each a grid of tool tiles, the everyday ones open and the rest folded
 * to open in place. A tile press sends its job in the chat for the part in front, or adds it after
 * a draft being written there for the person to send (`handToChat`).
 * It folds to an edge of the groups' icons, as chosen on this device, and on a narrow panel starts
 * folded so the model keeps the room.
 */
export function StudioToolbox(props: {
  readonly threadRef: ScopedThreadRef;
  readonly folder: string | null;
  readonly composerRef: ComposerHandleRef | null;
}) {
  const { threadRef, composerRef } = props;
  const { part, process } = usePartInFront(threadRef, props.folder);
  const jobs = usePartJobs(threadRef.environmentId, part?.kind ?? null, process);
  const groups = useMemo(() => toolboxGroups(jobs.menus), [jobs.menus]);
  const [view, dispatch] = useReducer(toolboxView, { open: null });

  // Another part in front: back to the groups, its jobs are not the last part's.
  const partPath = part?.path ?? null;
  const [viewedPath, setViewedPath] = useState(partPath);
  if (viewedPath !== partPath) {
    setViewedPath(partPath);
    dispatch({ type: "part-changed" });
  }

  const navigate = useNavigate();
  const router = useRouter();
  const browse = (group: HardwareActionGroup) =>
    void navigate(
      toolboxLibraryLink(group, {
        workspaceOpen: useOpenWorkspaceStore.getState().workspace !== null,
        from: router.state.location.href,
      }),
    );

  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const cardRefs = useRef(new Map<HardwareActionGroup, HTMLButtonElement>());
  const { folded, setFolded } = useFolding(rootRef);

  const usable = part !== null && jobs.status === "ready";
  const openGroup =
    usable && view.open !== null
      ? (groups.find((group) => group.group === view.open && jobCount(group) > 0) ?? null)
      : null;

  // A press moves focus with the slide: onto Back in the group, onto the group's card coming
  // back. A part changing under it leaves focus where the person has it.
  const open = (group: HardwareActionGroup) => {
    flushSync(() => dispatch({ type: "open", group }));
    backRef.current?.focus();
  };
  const back = (group: HardwareActionGroup) => {
    flushSync(() => dispatch({ type: "back" }));
    cardRefs.current.get(group)?.focus();
  };

  const run = (action: HardwareAction) => {
    if (composerRef === null || part === null) return;
    handToChat(composerRef, action.prompt(serializeComposerFileLink(part.path)));
  };

  if (folded) {
    return (
      <div
        ref={rootRef}
        className="flex w-10 shrink-0 flex-col items-center gap-1 border-l border-border py-1.5"
        data-studio-toolbox="folded"
      >
        <Button
          variant="ghost-muted"
          size="icon-sm"
          aria-label="Open the Toolbox"
          title="Open the Toolbox"
          onClick={() => setFolded(false)}
        >
          <PanelRightOpenIcon aria-hidden="true" />
        </Button>
        {groups.map((group) => {
          const Icon = MENU_ICONS[group.group];
          return (
            <Button
              key={group.group}
              variant="ghost"
              size="icon-sm"
              aria-label={group.group}
              title={group.group}
              onClick={() => {
                flushSync(() => setFolded(false));
                if (usable && jobCount(group) > 0) open(group.group);
              }}
            >
              <Icon aria-hidden="true" />
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="flex w-56 min-w-0 shrink flex-col border-l border-border"
      data-studio-toolbox="open"
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border ps-3 pe-1.5">
        <h2 className="text-sm font-medium text-foreground">Toolbox</h2>
        <Button
          variant="ghost-muted"
          size="icon-xs"
          aria-label="Fold the Toolbox"
          title="Fold the Toolbox"
          onClick={() => setFolded(true)}
        >
          <PanelRightCloseIcon aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {openGroup === null ? (
          // Coming back slides the groups in from the left, as the group slid in from the right.
          <div className="flex flex-col gap-3 p-3 transition-[opacity,translate] duration-180 ease-out starting:-translate-x-3 starting:opacity-0 motion-reduce:transition-none">
            {groups.map((group) => (
              <GroupCard
                key={group.group}
                group={group}
                environmentId={threadRef.environmentId}
                usable={usable}
                onOpen={() => open(group.group)}
                cardRef={(element) => {
                  if (element === null) cardRefs.current.delete(group.group);
                  else cardRefs.current.set(group.group, element);
                }}
              />
            ))}
            {part === null ? (
              <p className="text-xs text-muted-foreground">Open a part to see what it can do.</p>
            ) : jobs.status === "loading" ? (
              <p className="text-xs text-muted-foreground">Loading jobs…</p>
            ) : jobs.status === "failed" ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-xs text-muted-foreground">Couldn't load the jobs.</p>
                <Button variant="outline" size="xs" onClick={jobs.retry}>
                  Try again
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            key={openGroup.group}
            className="flex flex-col gap-1 p-1.5 transition-[opacity,translate] duration-180 ease-out starting:translate-x-3 starting:opacity-0 motion-reduce:transition-none"
          >
            <div className="self-start">
              <Button
                ref={backRef}
                variant="ghost"
                size="sm"
                aria-label={`Back from ${openGroup.group}`}
                onClick={() => back(openGroup.group)}
              >
                <ChevronLeftIcon aria-hidden="true" />
                {openGroup.group}
              </Button>
            </div>
            {composerRef === null ? (
              <p className="px-2 text-xs text-muted-foreground">
                Jobs start in a chat. Open one to use them.
              </p>
            ) : null}
            {openGroup.sections.map((section) => (
              <SectionJobs
                key={section.title}
                section={section}
                disabled={composerRef === null}
                onRun={run}
              />
            ))}
            <div className="px-1 pt-1">
              <Button variant="ghost-muted" size="xs" onClick={() => browse(openGroup.group)}>
                What each makes…
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Whether the Toolbox is folded, and the way to fold or open it. The person's choice holds on a
 * wide panel and is remembered on this device; a narrow one (`toolboxFolded`) starts it folded and
 * forgets an opening there once it is wide again.
 */
function useFolding(rootRef: RefObject<HTMLDivElement | null>) {
  const [chosen, setChosen] = useState(readToolboxFolded);
  const [narrow, setNarrow] = useState(false);
  const [openedNarrow, setOpenedNarrow] = useState(false);
  const [seenNarrow, setSeenNarrow] = useState(narrow);
  if (seenNarrow !== narrow) {
    setSeenNarrow(narrow);
    setOpenedNarrow(false);
  }
  useLayoutEffect(() => {
    // The panel's body, the surface and the Toolbox side by side (`RightPanelTabs`' aside).
    const body = rootRef.current?.closest("[data-right-panel-body]");
    if (!body) return;
    return observeResize(body, (entries) => {
      const width = entries.at(-1)?.contentRect.width;
      if (width === undefined) return;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setNarrow(width < TOOLBOX_NARROW_REM * rem);
    });
  }, [rootRef]);
  return {
    folded: toolboxFolded({ chosen, narrow, openedNarrow }),
    setFolded: (next: boolean) => {
      if (narrow) {
        setOpenedNarrow(!next);
        return;
      }
      setChosen(next);
      writeToolboxFolded(next);
    },
  };
}

/** A group as a card: its Library picture, its name, and how many jobs the part has in it. */
function GroupCard({
  cardRef,
  ...props
}: {
  readonly group: ToolboxGroup;
  readonly environmentId: EnvironmentId;
  /** A part is in front and its jobs are known. */
  readonly usable: boolean;
  readonly onOpen: () => void;
  readonly cardRef: (element: HTMLButtonElement | null) => void;
}) {
  const count = jobCount(props.group);
  const entry = LIBRARY_DOCUMENTS.find((candidate) => candidate.id === props.group.picture);
  const Icon = MENU_ICONS[props.group.group];
  return (
    <LibraryCard
      ref={cardRef}
      picture={
        entry === undefined ? (
          <span className={`flex items-center justify-center ${PICTURE_BOX}`}>
            <Icon aria-hidden="true" className="size-8 text-muted-foreground" />
          </span>
        ) : (
          <Suspense fallback={<span className={`block ${PICTURE_BOX}`} />}>
            <LibraryPicture
              entry={entry}
              environmentId={props.environmentId}
              className="border-b border-border"
            />
          </Suspense>
        )
      }
      name={props.group.group}
      note={props.usable ? (count === 0 ? "Nothing here for this file" : jobsNote(count)) : null}
      disabled={!props.usable || count === 0}
      onOpen={props.onOpen}
    />
  );
}

/** A section's title over its jobs as tool tiles, two to a row; a folded one opens in place. */
function SectionJobs(props: {
  readonly section: ToolboxSection;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  readonly onRun: (action: HardwareAction) => void;
}) {
  return (
    <Collapsible defaultOpen={!props.section.folded}>
      <CollapsibleTrigger className="group flex h-7 w-full items-center gap-1 rounded-md px-2 text-left text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className="min-w-0 flex-1 truncate">{props.section.title}</span>
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform duration-150 group-data-panel-open:rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="grid grid-cols-2 gap-1.5 px-1 pb-2">
          {props.section.actions.map((action) => (
            <ToolTile
              key={action.id}
              action={action}
              icon={toolIcon(action)}
              disabled={props.disabled}
              onRun={() => props.onRun(action)}
            />
          ))}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/**
 * A job as a tool to pick up: a square raised tile, its own picture (`toolIcon`) large in its
 * group's color over its name. What it makes shows on hover and is the tile's description for
 * readers. A press sends the job (`onRun`).
 */
function ToolTile(props: {
  readonly action: HardwareAction;
  /** Its picture (`toolIcon`). */
  readonly icon: LucideIcon;
  readonly disabled: boolean;
  readonly onRun: () => void;
}) {
  const { action, icon: Icon } = props;
  const tint = MENU_TINTS[action.group];
  const describedBy = useId();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            disabled={props.disabled}
            onClick={props.onRun}
            aria-describedby={describedBy}
            className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background p-2 text-center shadow-xs outline-none transition-[border-color,background-color,box-shadow,scale] duration-150 dark:bg-input/32 enabled:hover:border-foreground/25 enabled:hover:bg-accent/50 dark:enabled:hover:bg-input/64 enabled:active:scale-97 enabled:active:bg-accent enabled:active:shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-64 motion-reduce:transition-none motion-reduce:enabled:active:scale-100"
          />
        }
      >
        <span
          aria-hidden="true"
          className={`flex size-11 shrink-0 items-center justify-center rounded-md bg-current/10 dark:bg-current/15 ${tint}`}
        >
          <Icon className="size-7" strokeWidth={1.75} />
        </span>
        <span className="line-clamp-2 text-xs leading-tight font-medium text-foreground">
          {action.label}
        </span>
        <span id={describedBy} hidden>
          {action.gets}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="left">{action.gets}</TooltipPopup>
    </Tooltip>
  );
}
