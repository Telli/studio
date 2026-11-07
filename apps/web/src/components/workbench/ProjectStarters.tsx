import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useFilesystemReadAccess } from "~/state/filesystem";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { fileTint, KIND_ICONS } from "./kinds";
import { useStudioProjectAt } from "./useStudioProjects";
import { folderFiles } from "./projectModels";
import { projectStarters } from "./starterJobs";
import { useFolderModels } from "./useFolderModels";
import { useLeadPart } from "./useLeadPart";

/**
 * A new thread's starters in Studio, made from the project (`starterJobs.ts`): its lead part, the
 * one the Overview shows, then its most recently used files (the project search's own order) and
 * its brief. An even block of the chat's chips (`ChangeChip`), two columns over the composer, each
 * with the icon and hue of the kind of work it starts, so none outranks it; a long name wraps.
 * Nothing without a project. A pick goes into the composer to edit before sending.
 */
export function ProjectStarters(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly composerRef: ComposerHandleRef;
}) {
  const { environmentId, cwd } = props;
  const { canReadFiles } = useFilesystemReadAccess(environmentId);
  const recent = useEnvironmentQuery(
    canReadFiles
      ? projectEnvironment.searchEntries({
          environmentId,
          input: { cwd, query: "", limit: 200, kind: "file" },
        })
      : null,
  ).data?.entries;
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const brief = useStudioProjectAt(environmentId, cwd)?.project.brief ?? null;
  // Its cadgen 0.8 models stand where their scripts are among its recent files.
  const models = useFolderModels(environmentId, cwd);
  const lead = useLeadPart(environmentId, cwd)?.file ?? null;
  const starters = useMemo(() => {
    const paths = (recent ?? []).map((entry) => entry.path);
    const files = folderFiles(paths, models);
    const skills = new Set(
      (plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : [])),
    );
    return projectStarters(files, skills, brief, new Set(paths), lead);
  }, [recent, models, plugins, brief, lead]);
  if (starters.length === 0) return null;

  return (
    <div className="pointer-events-auto mt-4 grid grid-cols-2 gap-1">
      {starters.map((starter) => {
        const Icon = KIND_ICONS[starter.kind];
        return (
          <button
            key={starter.label}
            type="button"
            className="flex min-h-6 min-w-0 items-start gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-start text-xs leading-4.5 text-foreground outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={() => {
              const composer = props.composerRef.current;
              if (!composer) return;
              composer.insertTextAtEnd(starter.prompt, { ensureLeadingBoundary: true });
              composer.focusAtEnd();
            }}
          >
            <Icon
              className={`mt-0.5 size-3.5 shrink-0 ${fileTint(starter.kind)}`}
              aria-hidden="true"
            />
            <span className="min-w-0">{starter.label}</span>
          </button>
        );
      })}
    </div>
  );
}
