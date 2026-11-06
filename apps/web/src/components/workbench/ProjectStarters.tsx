import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useFilesystemReadAccess } from "~/state/filesystem";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { useStudioProjectAt } from "./useStudioProjects";
import { folderFiles } from "./projectModels";
import { projectStarters } from "./starterJobs";
import { useFolderModels } from "./useFolderModels";

/**
 * A new thread's starters in Studio, made from the project (`starterJobs.ts`):
 * its most recently used files (the project search's own order) and its brief.
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
  const starters = useMemo(() => {
    const paths = (recent ?? []).map((entry) => entry.path);
    const files = folderFiles(paths, models);
    const skills = new Set(
      (plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : [])),
    );
    return projectStarters(files, skills, brief, new Set(paths));
  }, [recent, models, plugins, brief]);
  if (starters.length === 0) return null;

  return (
    <div className="pointer-events-auto mt-4 flex flex-wrap gap-2">
      {starters.map((starter) => (
        // A box that can shrink, so a long one wraps in a narrow dock.
        <div key={starter.label} className="min-w-0">
          <Button
            variant="outline"
            size="sm-multiline"
            className="text-start"
            onClick={() => {
              const composer = props.composerRef.current;
              if (!composer) return;
              composer.insertTextAtEnd(starter.prompt, { ensureLeadingBoundary: true });
              composer.focusAtEnd();
            }}
          >
            {starter.label}
          </Button>
        </div>
      ))}
    </div>
  );
}
