import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useFilesystemReadAccess } from "~/state/filesystem";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { BRIEF_JSON, parseBrief } from "./briefFolder";
import { classifyProjectFile, type ProjectFile } from "./projectFiles";
import { projectStarters } from "./starterJobs";

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
  const brief = parseBrief(
    useEnvironmentQuery(
      projectEnvironment.readFile({ environmentId, input: { cwd, relativePath: BRIEF_JSON } }),
    ).data?.contents,
  );
  const starters = useMemo(() => {
    const files = (recent ?? [])
      .map((entry) => classifyProjectFile(entry.path))
      .filter((file): file is ProjectFile => file !== null);
    const skills = new Set(
      (plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : [])),
    );
    return projectStarters(files, skills, brief);
  }, [recent, plugins, brief]);
  if (starters.length === 0) return null;

  return (
    <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-2">
      {starters.map((starter) => (
        <Button
          key={starter.label}
          variant="outline"
          size="compact"
          onClick={() => {
            const composer = props.composerRef.current;
            if (!composer) return;
            composer.insertTextAtEnd(starter.prompt, { ensureLeadingBoundary: true });
            composer.focusAtEnd();
          }}
        >
          {starter.label}
        </Button>
      ))}
    </div>
  );
}
