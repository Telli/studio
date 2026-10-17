import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { type ReactNode, useMemo } from "react";

import { useComposerHandleContext } from "~/composerHandleContext";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { CheckBadge } from "./CheckBadge";
import { PartActions } from "./PartActions";
import { shownChecks } from "./partChecks";
import { buildLabel, materialLabel } from "./partLabels";
import { partLabel } from "./partNames";
import { useEngineeringSurfaces } from "./studioInterface";
import { useOpenInWorkbench } from "./useOpenInWorkbench";
import { usePartContext } from "./usePartContext";
import { useProjectChecks } from "./useProjectChecks";
import { useStudioProjectAt } from "./useStudioProjects";

function Cell(props: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly tone?: "default" | "faint" | "error";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-center gap-0.5 border-r border-border px-3",
        props.className,
      )}
    >
      <dt className="text-2xs leading-none font-medium tracking-widest text-muted-foreground uppercase">
        {props.label}
      </dt>
      <dd
        className={cn(
          "truncate text-xs leading-tight tabular-nums",
          props.tone === "faint"
            ? "text-muted-foreground/70"
            : props.tone === "error"
              ? "text-destructive"
              : "text-foreground",
        )}
      >
        {props.children}
      </dd>
    </div>
  );
}

interface TitleBlockProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly pluginId: string;
  /** The thread's folder: the checks of the part on screen are read from its project's folders. */
  readonly cwd?: string | undefined;
  /** The thread's latest file changes: a check its agent just ran shows. */
  readonly mutationId?: string | null | undefined;
}

/**
 * The drawing's title block, over the viewer: the part on screen, its type,
 * units, material, last build and checks (each opening its result; a result
 * on screen leads back to its part), read the way a shop drawing reads, and the
 * jobs it takes (Check, Make, Document) as the ribbon beside it. In the
 * engineering surfaces only (`useEngineeringSurfaces`), and only while the viewer shows a part of this plugin.
 */
export function TitleBlock(props: TitleBlockProps) {
  if (!useEngineeringSurfaces()) return null;
  return <ThreadTitleBlock {...props} />;
}

function ThreadTitleBlock(props: TitleBlockProps) {
  const shown = usePartContext({ environmentId: props.environmentId, threadId: props.threadId });
  const composerRef = useComposerHandleContext();
  useNowMinute();
  const studio = useStudioProjectAt(props.environmentId, props.cwd ?? null);
  const folders = useMemo(
    () => studio?.project.folders ?? (props.cwd === undefined ? [] : [props.cwd]),
    [studio, props.cwd],
  );
  const checks = useProjectChecks({
    environmentId: props.environmentId,
    folders,
    mutationId: props.mutationId ?? null,
  });
  const threadRef = useMemo(
    () => scopeThreadRef(props.environmentId, props.threadId),
    [props.environmentId, props.threadId],
  );
  const open = useOpenInWorkbench(threadRef);
  if (shown === null || shown.pluginId !== props.pluginId) return null;
  const { part } = shown;
  const material = materialLabel(part.materials);
  const build = buildLabel(part.build);
  // Its checks, a click from their results; a result on screen leads back to the part it checked.
  const about = shownChecks(checks, part.path);
  const model = part.kind === "Part" || part.kind === "Assembly";

  return (
    <div
      data-title-block=""
      className="@container/title-block flex h-11 shrink-0 items-stretch border-b border-border bg-background"
    >
      <dl className="flex min-w-0 flex-1 items-stretch">
        <Cell label="Part" className="max-w-2/5 shrink">
          <span className="font-medium">{part.name}</span>
        </Cell>
        <Cell label="Type" className="hidden shrink-0 @md/title-block:flex">
          {part.kind}
        </Cell>
        {part.units === null ? null : (
          <Cell label="Units" className="hidden shrink-0 @md/title-block:flex">
            {part.units}
          </Cell>
        )}
        {material === null ? null : (
          <Cell
            label="Material"
            className="hidden min-w-0 shrink @lg/title-block:flex"
            tone={material.missing ? "faint" : "default"}
          >
            {material.text}
          </Cell>
        )}
        {build === null ? null : (
          <Cell label="Build" className="shrink-0" tone={build.failed ? "error" : "default"}>
            {build.text}
          </Cell>
        )}
        {about.results.length > 0 ? (
          <Cell label="Checks" className="min-w-0 shrink">
            <span className="flex min-w-0 gap-1 overflow-hidden">
              {about.results.map(({ root, result }) => (
                <CheckBadge
                  key={`${root}/${result.path}`}
                  result={result}
                  onOpen={() => open(`${root.replace(/[\\/]+$/, "")}/${result.model}`)}
                />
              ))}
            </span>
          </Cell>
        ) : model ? (
          <Cell label="Checks" className="hidden shrink-0 @md/title-block:flex" tone="faint">
            Not checked yet
          </Cell>
        ) : null}
        {about.of === null ? null : (
          <Cell label="Checked part" className="min-w-0 shrink">
            <button
              type="button"
              onClick={() => open(about.of!)}
              className="truncate rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {partLabel(about.of)}
            </button>
          </Cell>
        )}
      </dl>
      {composerRef === null ? null : (
        <div className="flex shrink-0 items-center px-1.5">
          <PartActions
            environmentId={props.environmentId}
            file={serializeComposerFileLink(part.path)}
            kind={part.kind}
            composerRef={composerRef}
          />
        </div>
      )}
    </div>
  );
}
