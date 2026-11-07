import type { ScopedThreadRef } from "@t3tools/contracts";
import { PanelRightCloseIcon } from "lucide-react";
import {
  type ReactElement,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Toggle, ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { GROUP_PURPOSES, type HardwareAction, type HardwareActionGroup } from "./hardwareActions";
import { MENU_ICONS, MENU_TINTS, MENU_WORDS } from "./kinds";
import { handToChat } from "./handToChat";
import { withToolLine } from "./toolUsed";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { partLink } from "./partLink";
import { useSimpleView } from "./simpleView";
import { usePartForJobs } from "./StudioPanelBar";
import { SECTION_GRID, SectionJobs } from "./ToolboxJobs";
import {
  pairLoneSections,
  readToolboxFolded,
  readToolboxTab,
  jobCount,
  type ToolboxGroup,
  toolboxFolded,
  toolboxGroups,
  toolboxLeftOut,
  toolboxLibraryLink,
  toolboxNarrowRem,
  toolboxShownGroup,
  writeToolboxFolded,
  writeToolboxTab,
} from "./toolbox";
import { usePartJobs } from "./usePartJobs";

/**
 * The Toolbox, down the right of the workspace panel beside the part, the same in AI and CAD: the
 * jobs (`usePartJobs`) of the part in front, else the project's (`usePartForJobs`), as Analysis,
 * Manufacturing and Documents (`toolboxGroups`, `MENU_WORDS`), a tab each, like SolidWorks' CommandManager; the tab
 * left open is remembered on this device. A group with no job for the file in front can't be
 * chosen, says why on its tooltip, and the Toolbox opens on one that has jobs and says what to open
 * for the rest. Every job
 * in a group is a tile like every other, nothing folded: the group's purpose over one even grid of
 * tiles, each section's name over its first.
 * A tile press sends its job in the chat for that part, or adds it after a draft being written
 * there for the person to send (`handToChat`). It folds to an edge of the groups' icons, as chosen
 * on this device, and on a narrow panel (`toolboxNarrowRem`: in CAD, one beside a chat) starts
 * folded so the model keeps the room; a group's icon there, in its jobs' color, opens it on that
 * group's tab, and the group it would open on sits on a filled tile, as the sidebar's active row.
 */
export function StudioToolbox(props: {
  readonly threadRef: ScopedThreadRef;
  readonly folder: string | null;
  readonly composerRef: ComposerHandleRef | null;
  /** The thread's workspace changes, which can make the project's first part. */
  readonly mutationId: string | null;
}) {
  const { threadRef, composerRef } = props;
  const { part, process } = usePartForJobs(threadRef, props.folder, props.mutationId);
  const jobs = usePartJobs(threadRef.environmentId, part?.kind ?? null, process);
  const groups = useMemo(() => toolboxGroups(jobs.menus), [jobs.menus]);

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
  const { folded, setFolded } = useFolding(rootRef);
  const [tab, setTabState] = useState(readToolboxTab);
  const setTab = (group: HardwareActionGroup) => {
    setTabState(group);
    writeToolboxTab(group);
  };
  // Until the jobs are known, no group counts as empty and the tab left open holds.
  const ready = part !== null && jobs.status === "ready";
  const shown = ready
    ? toolboxShownGroup(groups, tab)
    : groups.find((group) => group.group === tab);
  const leftOut = ready ? toolboxLeftOut(groups, part.kind) : null;

  const run = (action: HardwareAction) => {
    if (composerRef === null || part === null) return;
    handToChat(composerRef, withToolLine(action.label, action.prompt(partLink(part))));
  };

  // From the folded edge: open on that group's tab.
  const openOn = (group: HardwareActionGroup) => {
    setTab(group);
    setFolded(false);
  };

  if (folded) {
    return (
      <div
        ref={rootRef}
        className="flex w-10 shrink-0 flex-col items-center gap-2 border-l border-border py-2"
        data-studio-toolbox="folded"
      >
        {groups.map((group) => {
          const Icon = MENU_ICONS[group.group];
          return (
            <ToolboxTip key={group.group} text={MENU_WORDS[group.group]} side="left">
              <Toggle
                variant="ghost"
                size="lg"
                aria-label={MENU_WORDS[group.group]}
                pressed={group.group === shown?.group}
                onPressedChange={() => openOn(group.group)}
              >
                <Icon aria-hidden="true" className={cn("size-4.5", MENU_TINTS[group.group])} />
              </Toggle>
            </ToolboxTip>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="flex w-64 shrink-0 flex-col border-l border-border"
      data-studio-toolbox="open"
    >
      {/* As tall as the ribbon's tab row beside it, so their hairlines run on as one. */}
      <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-border ps-3 pe-1">
        <h2 className="text-sm font-medium text-foreground">Toolbox</h2>
        <ToolboxTip text="Fold the Toolbox" side="bottom">
          <Button
            variant="ghost-muted"
            size="icon-xs"
            aria-label="Fold the Toolbox"
            onClick={() => setFolded(true)}
          >
            <PanelRightCloseIcon aria-hidden="true" />
          </Button>
        </ToolboxTip>
      </div>
      <div className="shrink-0 border-b border-border p-3">
        {/* Each its group's icon (the folded edge's, in its jobs' color) over its name, the one in
            front marked by the underline alone, so no tray stands behind them. Sized by its name with
            the spare room shared out, and the panel holds its width (`w-64`) for that room: at equal
            thirds, or narrower, Manufacturing runs into its neighbours. */}
        <ToggleGroup
          aria-label="Toolbox group"
          value={shown === undefined ? [] : [shown.group]}
          variant="underline"
          size="tile"
          className="w-full"
          onValueChange={(value) => {
            // Pressing the tab in front clears the group: it stays as it is.
            const next = groups.find((group) => group.group === value[0]);
            if (next) setTab(next.group);
          }}
        >
          {groups.map((group) => {
            const Icon = MENU_ICONS[group.group];
            const off = ready && jobCount(group) === 0;
            const item = (
              <ToggleGroupItem
                key={group.group}
                value={group.group}
                disabled={off}
                className="flex-auto"
              >
                <Icon aria-hidden="true" className={MENU_TINTS[group.group]} />
                {MENU_WORDS[group.group]}
              </ToggleGroupItem>
            );
            if (!off) return item;
            // A disabled button takes no pointer, so the tooltip hangs on a box around it.
            return (
              <ToolboxTip
                key={group.group}
                text={toolboxLeftOut([group], part.kind) ?? MENU_WORDS[group.group]}
                side="bottom"
              >
                <span className="flex min-w-0 flex-auto">{item}</span>
              </ToolboxTip>
            );
          })}
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-3">
          {part === null ? (
            <p className="text-xs text-muted-foreground">
              The Toolbox works on a part you already have. Start one with New, or import one.
            </p>
          ) : jobs.status === "loading" ? (
            <p className="text-xs text-muted-foreground">Loading jobs…</p>
          ) : jobs.status === "failed" ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-xs text-muted-foreground">Couldn't load the jobs.</p>
              <Button variant="outline" size="sm" onClick={jobs.retry}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              {composerRef === null ? (
                <p className="text-xs text-muted-foreground">
                  Jobs start in a chat. Open one to use them.
                </p>
              ) : null}
              {shown ? (
                <GroupJobs
                  group={shown}
                  leftOut={leftOut}
                  disabled={composerRef === null}
                  onRun={run}
                  onBrowse={() => browse(shown.group)}
                />
              ) : null}
            </>
          )}
        </div>
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
  const narrowRem = toolboxNarrowRem(useSimpleView());
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
      setNarrow(width < narrowRem * rem);
    });
  }, [rootRef, narrowRem]);
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

/** A control's tooltip, in the app's own. */
function ToolboxTip(props: {
  readonly text: string;
  readonly side: "left" | "bottom";
  readonly children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.children} />
      <TooltipPopup side={props.side}>{props.text}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * The tab in front: what the group is for, then its sections, each a title over its tiles (`SectionJobs`),
 * and the Library's word on what each makes.
 */
function GroupJobs(props: {
  readonly group: ToolboxGroup;
  /** What the file in front has no jobs for, and what to open for them (`toolboxLeftOut`). */
  readonly leftOut: string | null;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  readonly onRun: (action: HardwareAction) => void;
  readonly onBrowse: () => void;
}) {
  const empty = props.group.sections.length === 0;
  return (
    <section aria-label={props.group.group} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{GROUP_PURPOSES[props.group.group]}</p>
      {empty ? null : (
        <div className={SECTION_GRID}>
          {pairLoneSections(props.group.sections).map((section) => (
            <SectionJobs
              key={section.title}
              section={section}
              disabled={props.disabled}
              onRun={props.onRun}
            />
          ))}
        </div>
      )}
      {props.leftOut === null ? null : (
        <p className="text-xs text-muted-foreground">{props.leftOut}</p>
      )}
      {empty ? null : (
        // Its padding pulled back so its words start under the sections' titles.
        <div className="-ms-2.5">
          <Button variant="ghost-muted" size="sm" onClick={props.onBrowse}>
            See what each makes
          </Button>
        </div>
      )}
    </section>
  );
}
