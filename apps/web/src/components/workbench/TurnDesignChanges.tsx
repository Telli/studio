import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  ActivityIcon,
  BoxIcon,
  CircuitBoardIcon,
  FileCogIcon,
  FileTextIcon,
  ImageIcon,
  type LucideIcon,
  PencilRulerIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { type DesignChange, designChanges } from "./designChanges";
import { useEngineeringInterface } from "./studioInterface";
import { useOpenInWorkbench } from "./useOpenInWorkbench";

const ICONS: Readonly<Record<string, LucideIcon>> = {
  Check: ActivityIcon,
  Document: FileTextIcon,
  Part: BoxIcon,
  Source: BoxIcon,
  Mesh: BoxIcon,
  Robot: BoxIcon,
  Board: CircuitBoardIcon,
  Schematic: CircuitBoardIcon,
  Harness: CircuitBoardIcon,
  Drawing: PencilRulerIcon,
  "FEA study": ActivityIcon,
  "CAM job": FileCogIcon,
  "G-code": FileCogIcon,
  Gerbers: FileCogIcon,
  "Bill of materials": FileCogIcon,
  "Pick and place": FileCogIcon,
  Image: ImageIcon,
  Setup: SlidersHorizontalIcon,
};
/** The icon's key: a manufacturing check by its own, anything unlisted as a document. */
const iconKey = (kind: string) =>
  kind in ICONS ? kind : kind.endsWith(" check") ? "Check" : "Document";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

function ChangeRow(props: { readonly change: DesignChange; readonly onOpen: (() => void) | null }) {
  const { change } = props;
  const Icon = ICONS[iconKey(change.kind)]!;
  const body = (
    <>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="shrink-0 truncate font-medium text-foreground">{change.label}</span>
      {change.aspects.length < 2 ? null : (
        <span className="min-w-0 truncate text-muted-foreground">{change.aspects.join(", ")}</span>
      )}
    </>
  );
  const row = "flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left text-xs";
  return (
    <li className="border-t border-border first:border-t-0">
      {props.onOpen === null ? (
        <div className={row}>{body}</div>
      ) : (
        <button
          type="button"
          onClick={props.onOpen}
          aria-label={`Open ${change.label}`}
          className={`${row} outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`}
        >
          {body}
        </button>
      )}
    </li>
  );
}

function DesignChangesCard(props: {
  readonly threadRef: ScopedThreadRef;
  readonly changes: ReadonlyArray<DesignChange>;
  readonly other: number;
}) {
  const open = useOpenInWorkbench(props.threadRef);
  const { changes, other } = props;
  return (
    <section
      aria-label="What changed"
      data-design-changes=""
      className="mt-4 overflow-hidden rounded-lg border border-border bg-background"
    >
      <h3 className="flex items-baseline gap-2 border-b border-border px-3 py-1.5 text-2xs font-medium tracking-widest text-muted-foreground uppercase">
        What changed
        {changes.length > 1 ? (
          <span className="tabular-nums text-muted-foreground/70">{changes.length}</span>
        ) : null}
      </h3>
      {changes.length === 0 ? null : (
        <ul className="flex flex-col">
          {changes.map((change) => (
            <ChangeRow
              key={`${change.kind}\n${change.label}`}
              change={change}
              onOpen={change.open === null ? null : () => open(change.open!)}
            />
          ))}
        </ul>
      )}
      {other === 0 ? null : (
        <p
          className={`px-3 py-1.5 text-2xs text-muted-foreground ${changes.length === 0 ? "" : "border-t border-border"}`}
        >
          {changes.length === 0
            ? `Updated ${plural(other, "project file")}`
            : `And ${plural(other, "other file")}`}
        </p>
      )}
    </section>
  );
}

/**
 * What a turn changed in the design, as its entry in the design history: in
 * the engineering interface, the parts and documents it changed (each opens
 * beside the thread) in place of the files `children` lists; elsewhere,
 * `children` as they are. The changes are the turn's checkpoint, so they are
 * what the files say, whatever the agent reported.
 */
export function TurnDesignChanges(props: {
  readonly threadRef: ScopedThreadRef | null;
  readonly files: ReadonlyArray<{ readonly path: string }>;
  readonly children: ReactNode;
}) {
  const engineering = useEngineeringInterface();
  const { changes, other } = useMemo(
    () => designChanges(props.files.map((file) => file.path)),
    [props.files],
  );
  if (!engineering) return props.children;
  if (props.threadRef === null || (changes.length === 0 && other === 0)) return null;
  return <DesignChangesCard threadRef={props.threadRef} changes={changes} other={other} />;
}
