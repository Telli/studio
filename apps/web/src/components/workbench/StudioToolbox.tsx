import type { ScopedThreadRef } from "@t3tools/contracts";
import { PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";
import { type RefObject, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useRouter } from "@tanstack/react-router";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { observeResize } from "~/lib/observeResize";
import { Button } from "../ui/button";
import { GROUP_PURPOSES, type HardwareAction, type HardwareActionGroup } from "./hardwareActions";
import { MENU_ICONS } from "./kinds";
import { handToChat } from "./handToChat";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { partLink } from "./partLink";
import { usePartForJobs } from "./StudioPanelBar";
import { SectionJobs } from "./ToolboxJobs";
import {
  readToolboxFolded,
  TOOLBOX_NARROW_REM,
  type ToolboxGroup,
  toolboxFolded,
  toolboxGroups,
  toolboxLibraryLink,
  writeToolboxFolded,
} from "./toolbox";
import { usePartJobs } from "./usePartJobs";

/**
 * The Toolbox, down the right of the workspace panel beside the part, the same in AI and CAD: the
 * jobs (`usePartJobs`) of the part in front, else the project's (`usePartForJobs`), as Evaluate,
 * Manufacture and Document (`toolboxGroups`). Every job is a tile like every other, in one list
 * with nothing folded or tucked behind another press: each group's name over its sections' tiles.
 * A tile press sends its job in the chat for that part, or adds it after a draft being written
 * there for the person to send (`handToChat`). It folds to an edge of the groups' icons, as chosen
 * on this device, and on a narrow panel starts folded so the model keeps the room; a group's icon
 * there opens it on that group.
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
  const headingRefs = useRef(new Map<HardwareActionGroup, HTMLHeadingElement>());
  const { folded, setFolded } = useFolding(rootRef);

  const run = (action: HardwareAction) => {
    if (composerRef === null || part === null) return;
    handToChat(composerRef, action.prompt(partLink(part)));
  };

  // From the folded edge: open, then bring that group's name to the top, with focus on it.
  const openOn = (group: HardwareActionGroup) => {
    flushSync(() => setFolded(false));
    const heading = headingRefs.current.get(group);
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
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
              onClick={() => openOn(group.group)}
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
        <div className="flex flex-col gap-5 p-2.5">
          {part === null ? (
            <p className="px-1 text-xs text-muted-foreground">
              The jobs are for a part. Make one in the chat, or import one, to see them.
            </p>
          ) : jobs.status === "loading" ? (
            <p className="px-1 text-xs text-muted-foreground">Loading jobs…</p>
          ) : jobs.status === "failed" ? (
            <div className="flex flex-col items-start gap-2 px-1">
              <p className="text-xs text-muted-foreground">Couldn't load the jobs.</p>
              <Button variant="outline" size="xs" onClick={jobs.retry}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              {composerRef === null ? (
                <p className="px-1 text-xs text-muted-foreground">
                  Jobs start in a chat. Open one to use them.
                </p>
              ) : null}
              {groups.map((group) => (
                <GroupJobs
                  key={group.group}
                  group={group}
                  disabled={composerRef === null}
                  onRun={run}
                  onBrowse={() => browse(group.group)}
                  headingRef={(element) => {
                    if (element === null) headingRefs.current.delete(group.group);
                    else headingRefs.current.set(group.group, element);
                  }}
                />
              ))}
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

/** A group: its name, then each of its sections' tiles, and the Library's word on what each makes. */
function GroupJobs({
  headingRef,
  ...props
}: {
  readonly group: ToolboxGroup;
  /** No chat to write the job into. */
  readonly disabled: boolean;
  readonly onRun: (action: HardwareAction) => void;
  readonly onBrowse: () => void;
  readonly headingRef: (element: HTMLHeadingElement | null) => void;
}) {
  const Icon = MENU_ICONS[props.group.group];
  const empty = props.group.sections.length === 0;
  return (
    <section className="flex flex-col gap-3">
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="flex items-center gap-1.5 px-1 text-sm font-medium text-foreground outline-none"
      >
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        {props.group.group}
      </h3>
      <p className="-mt-2 px-1 text-xs text-muted-foreground">
        {GROUP_PURPOSES[props.group.group]}
      </p>
      {empty ? (
        <p className="px-1 text-xs text-muted-foreground">Nothing here for this file.</p>
      ) : (
        props.group.sections.map((section) => (
          <SectionJobs
            key={section.title}
            section={section}
            disabled={props.disabled}
            onRun={props.onRun}
          />
        ))
      )}
      {empty ? null : (
        <div className="px-0.5">
          <Button variant="ghost-muted" size="xs" onClick={props.onBrowse}>
            What each makes…
          </Button>
        </div>
      )}
    </section>
  );
}
