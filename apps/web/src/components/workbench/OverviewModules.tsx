import {
  BookOpenIcon,
  BoxIcon,
  ChevronDownIcon,
  CircuitBoardIcon,
  FactoryIcon,
  FileTextIcon,
  FlaskConicalIcon,
  ImageIcon,
  type LucideIcon,
  RulerIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { filePlaces, type ProjectFile, type ProjectGroup } from "./projectFiles";
import { useEngineeringInterface } from "./studioInterface";

/** A module shows this many files before "Show all". */
const FIRST_FILES = 6;
const FOLDED_KEY = "studio:overview-folded";

export const MODULE_HEADING =
  "flex items-baseline gap-2 text-2xs font-medium tracking-widest text-muted-foreground uppercase";

const GROUP_ICONS: Record<ProjectGroup, LucideIcon> = {
  Models: BoxIcon,
  "Boards and wiring": CircuitBoardIcon,
  Drawings: RulerIcon,
  Studies: FlaskConicalIcon,
  Manufacturing: FactoryIcon,
  Documents: FileTextIcon,
  Images: ImageIcon,
  "Reference parts": BoxIcon,
  References: BookOpenIcon,
};

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
  readonly count?: number;
  readonly folded: boolean;
  readonly onFold: () => void;
  /** A link at the heading's end, such as Full history. */
  readonly action?: ReactNode;
  /** Across both columns of a wide Overview. */
  readonly wide?: boolean;
  readonly children: ReactNode;
}) {
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
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "size-3 self-center transition-transform duration-150",
              props.folded && "-rotate-90",
            )}
          />
          {props.title}
          {props.count === undefined ? null : (
            <span className="tabular-nums text-muted-foreground/70">{props.count}</span>
          )}
        </button>
        {props.folded ? null : props.action}
      </div>
      {props.folded ? null : (
        <div className="mt-1.5 flex flex-col border-t border-border">{props.children}</div>
      )}
    </section>
  );
}

/** A module of one kind of the project's files: its drawings, studies, documents and so on. */
export function FilesModule(props: {
  readonly group: ProjectGroup;
  readonly files: ReadonlyArray<{ readonly root: string; readonly file: ProjectFile }>;
  readonly folded: boolean;
  readonly onFold: () => void;
  readonly onOpen: (root: string, path: string) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? props.files : props.files.slice(0, FIRST_FILES);
  const engineering = useEngineeringInterface();
  const files = props.files.map(({ file }) => file);
  const places = engineering
    ? filePlaces(files)
    : new Map(files.map((file) => [file.path, file.path] as const));
  const Icon = GROUP_ICONS[props.group];
  return (
    <OverviewModule
      title={props.group}
      count={props.files.length}
      folded={props.folded}
      onFold={props.onFold}
    >
      <ul className="flex flex-col">
        {shown.map(({ root, file }) => (
          <li key={`${root}\n${file.path}`} className="border-b border-border py-1.5">
            <button
              type="button"
              onClick={() => props.onOpen(root, file.path)}
              className="flex w-full min-w-0 items-center gap-3 rounded-md text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
                <Icon className="size-4 text-muted-foreground/70" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium text-foreground">{file.title}</span>
                <span className="truncate text-2xs text-muted-foreground">
                  {file.kind}
                  {places.has(file.path) ? ` · ${places.get(file.path)}` : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
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
