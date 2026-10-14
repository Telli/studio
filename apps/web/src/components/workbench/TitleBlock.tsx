import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { ReactNode } from "react";

import { useComposerHandleContext } from "~/composerHandleContext";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { PartActions } from "./PartActions";
import { fileName } from "./partContext";
import { buildLabel, materialLabel } from "./partLabels";
import { useEngineeringInterface } from "./studioInterface";
import { usePartContext } from "./usePartContext";

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

/**
 * The drawing's title block, over the viewer: the part on screen, its type,
 * units, material and last build, read the way a shop drawing reads, and the
 * jobs it takes (Check, Make, Document) as the ribbon beside it. In the
 * engineering interface only, and only while the viewer shows a part of this plugin.
 */
export function TitleBlock(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly pluginId: string;
}) {
  if (!useEngineeringInterface()) return null;
  return <ThreadTitleBlock {...props} />;
}

function ThreadTitleBlock(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly pluginId: string;
}) {
  const shown = usePartContext({ environmentId: props.environmentId, threadId: props.threadId });
  const composerRef = useComposerHandleContext();
  useNowMinute();
  if (shown === null || shown.pluginId !== props.pluginId) return null;
  const { part } = shown;
  const material = materialLabel(part.materials);
  const build = buildLabel(part.build);

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
      </dl>
      {composerRef === null ? null : (
        <div className="flex shrink-0 items-center px-1.5">
          <PartActions
            environmentId={props.environmentId}
            file={fileName(part.path)}
            kind={part.kind}
            composerRef={composerRef}
          />
        </div>
      )}
    </div>
  );
}
