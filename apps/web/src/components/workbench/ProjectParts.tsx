import type { EnvironmentId } from "@t3tools/contracts";
import { BoxIcon, CircuitBoardIcon, FileIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useFilesystemReadAccess } from "~/state/filesystem";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { HARDWARE_FOCUS } from "./hardwareActions";
import { PartActions } from "./PartActions";
import { describePart, fileName } from "./partContext";
import { WORKBENCH_LAYOUT } from "./workbenchLayout";

/** How many of the project's parts a new thread lists, most recently used first. */
const SHOWN = 8;
/** The ending each search looks for; a match must end with one of `PART_ENDINGS`. */
const QUERIES = [".step", ".kicad_pcb", ".stl", ".dxf"] as const;
const PART_ENDINGS = [".step", ".stp", ".kicad_pcb", ".stl", ".3mf", ".dxf", ".urdf", ".sdf"];

const stemOf = (path: string) => path.replace(/\.[^./\\]+$/, "").toLowerCase();

/**
 * The project's CAD files among search results, in their order, without
 * repeats; a mesh exported beside its STEP (`bracket.stl` by `bracket.step`)
 * is the same part, so only the STEP stays.
 */
export function partsAmong(paths: ReadonlyArray<string>): string[] {
  const parts = [...new Set(paths)].filter((path) => {
    const lower = path.toLowerCase();
    return PART_ENDINGS.some((ending) => lower.endsWith(ending));
  });
  const steps = new Set(parts.filter((path) => /\.(step|stp)$/i.test(path)).map(stemOf));
  return parts.filter((path) => !/\.(stl|3mf)$/i.test(path) || !steps.has(stemOf(path)));
}

const folderOf = (path: string) => {
  const name = fileName(path);
  return path.length > name.length ? path.slice(0, path.length - name.length - 1) : "";
};

function PartIcon(props: { readonly kind: string }) {
  if (props.kind === "Board" || props.kind === "Schematic") {
    return <CircuitBoardIcon className="size-3.5 shrink-0" aria-hidden="true" />;
  }
  if (props.kind === "Drawing" || props.kind === "File") {
    return <FileIcon className="size-3.5 shrink-0" aria-hidden="true" />;
  }
  return <BoxIcon className="size-3.5 shrink-0" aria-hidden="true" />;
}

function useSearch(environmentId: EnvironmentId, cwd: string, query: string, enabled: boolean) {
  return useEnvironmentQuery(
    enabled
      ? projectEnvironment.searchEntries({
          environmentId,
          input: { cwd, query, limit: 100, kind: "file" },
        })
      : null,
  ).data?.entries;
}

/**
 * A new thread starts from a part: the project's CAD files, and once one is
 * picked, the jobs it takes (Check, Make, Document) naming it by its path.
 * Hardware focus only.
 */
export function ProjectParts(props: {
  readonly environmentId: EnvironmentId | null;
  readonly cwd: string | null;
  readonly composerRef: ComposerHandleRef;
}) {
  if (!WORKBENCH_LAYOUT || !HARDWARE_FOCUS || props.environmentId === null || props.cwd === null) {
    return null;
  }
  return (
    <ProjectPartList
      environmentId={props.environmentId}
      cwd={props.cwd}
      composerRef={props.composerRef}
    />
  );
}

function ProjectPartList(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly composerRef: ComposerHandleRef;
}) {
  const { canReadFiles } = useFilesystemReadAccess(props.environmentId);
  const step = useSearch(props.environmentId, props.cwd, QUERIES[0], canReadFiles);
  const board = useSearch(props.environmentId, props.cwd, QUERIES[1], canReadFiles);
  const mesh = useSearch(props.environmentId, props.cwd, QUERIES[2], canReadFiles);
  const drawing = useSearch(props.environmentId, props.cwd, QUERIES[3], canReadFiles);
  const parts = useMemo(
    () =>
      partsAmong(
        [step, board, mesh, drawing].flatMap((entries) =>
          (entries ?? []).map((entry) => entry.path),
        ),
      ).slice(0, SHOWN),
    [step, board, mesh, drawing],
  );
  const [picked, setPicked] = useState<string | null>(null);
  if (parts.length === 0) return null;

  if (picked !== null) {
    const { name, kind } = describePart(picked, null);
    return (
      <div className="pointer-events-auto mt-5 flex flex-wrap items-center justify-center gap-1">
        <span className="flex min-w-0 items-center gap-2 px-2 text-xs text-muted-foreground">
          <PartIcon kind={kind} />
          <span className="truncate font-medium text-foreground">{name}</span>
          <span className="truncate">{kind}</span>
        </span>
        <PartActions
          environmentId={props.environmentId}
          file={picked}
          kind={kind}
          composerRef={props.composerRef}
        />
        <Button
          variant="ghost-muted"
          size="icon-xs"
          aria-label="Choose another part"
          onClick={() => setPicked(null)}
        >
          <XIcon />
        </Button>
      </div>
    );
  }

  return (
    <section className="pointer-events-auto mt-5" aria-label="Parts in this project">
      <h2 className="mb-1 px-2 text-xs text-muted-foreground">Start from a part</h2>
      <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        {parts.map((path) => {
          const { name, kind } = describePart(path, null);
          const folder = folderOf(path);
          return (
            <li key={path} className="min-w-0">
              <button
                type="button"
                onClick={() => setPicked(path)}
                className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <PartIcon kind={kind} />
                <span className="shrink-0 font-medium text-foreground">{name}</span>
                <span className="shrink-0">{kind}</span>
                {folder === "" ? null : (
                  <span className="min-w-0 truncate text-muted-foreground/70">{folder}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
