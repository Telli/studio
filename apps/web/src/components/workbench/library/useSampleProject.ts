import type { EnvironmentId } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS, studioFolderKey } from "@t3tools/shared/studioProjects";
import { useCallback, useMemo } from "react";

import { readProjects, readThreadShells, useServerConfigs } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { studioProjectsEnvironment } from "~/state/studioProjects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { toastManager } from "../../ui/toast";
import { plainError } from "../importIntoProject";
import { showOverview } from "../overviewPanel";
import { listProjects } from "../projectList";
import { readStudioImport } from "../studioImportBridge";
import { useCreateStudioProject } from "../useCreateStudioProject";
import { copiedEntries } from "../useDuplicateProject";
import { openInPanel } from "../useOpenInWorkbench";
import { useOpenProject } from "../useOpenProject";
import {
  copySample,
  findSample,
  inTurn,
  SAMPLE_MARKER,
  SAMPLE_NAME,
  SAMPLE_PURPOSE,
  sampleMode,
} from "./sampleProject";

/** What the sample is, for its brief: a part bent from sheet. */
const SAMPLE_KIND = {
  ...STUDIO_PROJECT_KINDS.find((kind) => kind.id === "part")!,
  process: "Sheet metal",
} as const;

/** Each environment's open of the sample under way, which the next one waits for (`inTurn`). */
const underWay = new Map<string, Promise<unknown>>();

/**
 * The finished sample project the server names in its config (`sampleProject`), opened in Studio:
 * the copy made before (`findSample`), else a new project named `SAMPLE_NAME` holding a copy of
 * the sample's top-level files and folders, which the desktop app makes (`studioImport`). `open`
 * opens the project as its tile does, or, given a file in the sample (`parts/servo_bracket.step`),
 * that file beside its chat, and resolves to whether it opened. Null where nothing can be copied
 * (the web app, T3 Code, an environment on another computer, a server started without
 * `T3CODE_SAMPLE_PROJECT`): there Try a sample project starts the prompt in which the agent
 * builds it, and See the example is not offered.
 */
export function useSampleProject(environmentId: EnvironmentId) {
  const sample = useServerConfigs().get(environmentId)?.sampleProject ?? null;
  const bridge = readStudioImport();
  // The desktop app copies on this computer, so only into the environment it runs.
  const onThisComputer = usePrimaryEnvironmentId() === environmentId;
  const listStudioProjects = useAtomQueryRunner(studioProjectsEnvironment.list, {
    reportFailure: false,
    refresh: true,
  });
  const list = useAtomQueryRunner(projectEnvironment.listEntries, { reportFailure: false });
  const read = useAtomQueryRunner(projectEnvironment.readFile, { reportFailure: false });
  const write = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const create = useCreateStudioProject(environmentId);
  const openProject = useOpenProject();
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;

  const open = useCallback(
    (file?: string) =>
      inTurn(underWay, environmentId, async () => {
        if (sample === null || bridge === null) return false;
        const failed = (description: string) => {
          toastManager.add({
            type: "error",
            title: "Could not open the sample project",
            description,
          });
          return false;
        };
        try {
          const projects = await listStudioProjects({ environmentId, input: {} });
          if (projects._tag !== "Success") return failed("Studio's projects could not be read.");
          const found = await findSample(projects.value.projects, async (folder) => {
            const marker = await read({
              environmentId,
              input: { cwd: folder, relativePath: SAMPLE_MARKER },
            });
            return marker._tag === "Success";
          });
          if (found !== null) {
            // Read now, not from the last render: the copy may have been made a moment ago.
            const known = readProjects().filter((entry) => entry.environmentId === environmentId);
            const [card] = listProjects(
              { [found.id]: found.project },
              known,
              readThreadShells(),
              environmentId,
            ).cards;
            if (card === undefined || card.folder === null) {
              return failed("Its folder is not in Studio.");
            }
            const root = studioFolderKey(card.folder.workspaceRoot);
            await openProject(
              card.folder,
              card.threads,
              file === undefined
                ? undefined
                : (ref) => openInPanel(plugins, ref, `${root}/${file}`),
            );
            return true;
          }

          const listed = await list({ environmentId, input: { cwd: sample, directoryPath: "" } });
          if (listed._tag !== "Success") return failed("Its files could not be read.");
          const entries = listed.value.entries.map((entry) => entry.path);
          const copyInto = async (folder: string) => {
            // The new folder keeps what it starts with (its repository, its icon); its README
            // gives way to the sample's.
            const fresh = await list({ environmentId, input: { cwd: folder, directoryPath: "" } });
            const present =
              fresh._tag === "Success" ? fresh.value.entries.map((entry) => entry.path) : [];
            const from = studioFolderKey(sample);
            await copySample({
              entries: copiedEntries(entries, present),
              copy: (names) =>
                bridge.copy(
                  names.map((entry) => `${from}/${entry}`),
                  folder,
                ),
              writeReadme: entries.includes("README.md")
                ? async () => {
                    const readme = await read({
                      environmentId,
                      input: { cwd: sample, relativePath: "README.md" },
                    });
                    if (readme._tag !== "Success" || readme.value.truncated) {
                      throw new Error("Its README could not be read.");
                    }
                    const written = await write({
                      environmentId,
                      input: {
                        cwd: folder,
                        relativePath: "README.md",
                        contents: readme.value.contents,
                      },
                    });
                    if (written._tag !== "Success") {
                      throw new Error("Its README could not be written.");
                    }
                  }
                : null,
            });
          };
          return await create({
            environmentId,
            name: SAMPLE_NAME,
            kind: SAMPLE_KIND,
            units: "mm",
            material: "5052-H32 aluminium, 2 mm",
            purpose: SAMPLE_PURPOSE,
            folders: [],
            // A copy that fails throws out of `create` before it says the project was made or
            // opens its chat, and the catch below says so, once.
            onFolder: copyInto,
            // Its new chat runs in the copy, where the sample's paths hold.
            show: (ref) =>
              file === undefined ? showOverview(ref) : openInPanel(plugins, ref, file),
          });
        } catch (error) {
          return failed(plainError(error));
        }
      }),
    [
      bridge,
      create,
      environmentId,
      list,
      listStudioProjects,
      openProject,
      plugins,
      read,
      sample,
      write,
    ],
  );
  const opener = useMemo(() => ({ open }), [open]);
  const canCopy = bridge !== null && onThisComputer;
  return sampleMode({ sampleProject: sample, canCopy }) === "copy" ? opener : null;
}
