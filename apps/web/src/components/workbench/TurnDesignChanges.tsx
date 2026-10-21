import type { ScopedThreadRef } from "@t3tools/contracts";
import { type ReactNode, useMemo } from "react";

import { useRightPanelStore } from "~/rightPanelStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { type DesignChange, designChanges } from "./designChanges";
import { FILE_ICONS, fileIconKey } from "./kinds";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { useEngineeringInterface } from "./studioInterface";
import { useOpenInWorkbench } from "./useOpenInWorkbench";
import { useVersionRequestStore } from "./useVersions";

/** A part's model, which has versions to compare (`PartVersions`). */
const VERSIONED = /\.(?:step|stp)$/i;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** A change as a chip: what changed, opening it beside the thread where it can be shown. */
function ChangeChip(props: {
  readonly change: DesignChange;
  readonly onOpen: (() => void) | null;
  /** It opens what changed in the part, not the part itself. */
  readonly compares: boolean;
}) {
  const { change } = props;
  const Icon = FILE_ICONS[fileIconKey(change.kind)];
  // Which of a part's files changed with it (its model, its drawing), said on hover.
  const aspects = change.aspects.length < 2 ? undefined : change.aspects.join(", ");
  const chip =
    "inline-flex h-6 min-w-0 max-w-56 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs text-foreground";
  const body = (
    <>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{change.label}</span>
    </>
  );
  const control =
    props.onOpen === null ? (
      <span className={chip}>{body}</span>
    ) : (
      <button
        type="button"
        onClick={props.onOpen}
        aria-label={props.compares ? `See what changed in ${change.label}` : `Open ${change.label}`}
        className={`${chip} outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`}
      >
        {body}
      </button>
    );
  return (
    <li className="flex min-w-0">
      {aspects === undefined ? (
        control
      ) : (
        <Tooltip>
          <TooltipTrigger render={control} />
          <TooltipPopup side="top">{aspects}</TooltipPopup>
        </Tooltip>
      )}
    </li>
  );
}

/** What a turn changed, on one quiet line under its reply: "Changed" and a chip for each. */
function DesignChanges(props: {
  readonly threadRef: ScopedThreadRef;
  readonly changes: ReadonlyArray<DesignChange>;
  readonly other: number;
  readonly checkpointRef: string | null;
}) {
  const open = useOpenInWorkbench(props.threadRef);
  const { changes, other, checkpointRef, threadRef } = props;
  const compares = (change: DesignChange) =>
    checkpointRef !== null && change.open !== null && VERSIONED.test(change.open);
  // A changed part shows what changed in it, in the Overview's Versions, at this turn's version.
  const showChange = (change: DesignChange) => {
    const path = change.open;
    if (path === null) return null;
    return () => {
      // The project's README is its Overview: the pinned tab comes to the front, not a copy.
      if (/^(?:\.\/)?readme\.md$/i.test(path)) {
        useRightPanelStore.getState().open(threadRef, "files");
        return;
      }
      const folder = useOpenWorkspaceStore.getState().workspace?.folder ?? null;
      if (!compares(change) || checkpointRef === null || folder === null) {
        open(path);
        return;
      }
      useVersionRequestStore.getState().ask({ folder, path, ref: checkpointRef });
      useRightPanelStore.getState().open(threadRef, "files");
    };
  };
  return (
    <section
      aria-label="What changed"
      data-design-changes=""
      className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5"
    >
      {changes.length === 0 ? null : (
        <>
          <h3 className="text-xs text-muted-foreground">Changed</h3>
          <ul className="flex min-w-0 flex-wrap items-center gap-1.5">
            {changes.map((change) => (
              <ChangeChip
                key={`${change.kind}\n${change.label}`}
                change={change}
                onOpen={showChange(change)}
                compares={compares(change)}
              />
            ))}
          </ul>
        </>
      )}
      {other === 0 ? null : (
        <p className="text-xs text-muted-foreground">
          {changes.length === 0
            ? `Updated ${plural(other, "project file")}`
            : `and ${plural(other, "other file")}`}
        </p>
      )}
    </section>
  );
}

/**
 * What a turn changed in the design, as its entry in the design history: in
 * the engineering interface, the parts and documents it changed (a part opens
 * what changed in it at this turn, in the Overview's Versions; anything else
 * opens beside the thread) in place of the files `children` lists; elsewhere,
 * `children` as they are. The changes are the turn's checkpoint, so they are
 * what the files say, whatever the agent reported.
 */
export function TurnDesignChanges(props: {
  readonly threadRef: ScopedThreadRef | null;
  readonly files: ReadonlyArray<{ readonly path: string }>;
  /** The turn's checkpoint: a changed part opens what changed in it since the turn before. */
  readonly checkpointRef?: string | null | undefined;
  readonly children: ReactNode;
}) {
  const engineering = useEngineeringInterface();
  const { changes, other } = useMemo(
    () => designChanges(props.files.map((file) => file.path)),
    [props.files],
  );
  if (!engineering) return props.children;
  if (props.threadRef === null || (changes.length === 0 && other === 0)) return null;
  return (
    <DesignChanges
      threadRef={props.threadRef}
      changes={changes}
      other={other}
      checkpointRef={props.checkpointRef ?? null}
    />
  );
}
