import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";
import { useCallback, useMemo } from "react";

import { useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { studioProjectsEnvironment } from "~/state/studioProjects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { toastManager } from "../ui/toast";
import { plainError } from "./importIntoProject";
import {
  freePartStem,
  PART_FOLDER,
  partStem,
  starterScript,
  starterStepAs,
  untitledName,
} from "./newPart";
import { setSimpleView } from "./simpleView";
import { useCreateStudioProject } from "./useCreateStudioProject";
import { openInPanel } from "./useOpenInWorkbench";

/** What a new part's project is, for its brief: a part. */
const PART_KIND = STUDIO_PROJECT_KINDS.find((kind) => kind.id === "part")!;

/** The STEP the starter builds, loaded the first time a part is made: it is 17 KB of text. */
const loadStarterStep = () => import("./starter/part.step?raw").then((module) => module.default);

/** Each environment's New part under way: a second press while it is made does nothing more. */
const underWay = new Map<string, Promise<void>>();

/**
 * Writes a part's starter into a folder (`starterScript`, and the STEP it builds) and opens it
 * beside the chat in CAD mode, the full workspace, as the Overview's file list opens a part. A
 * write that fails throws, naming the file.
 */
function useWriteStarter(environmentId: EnvironmentId | null) {
  const write = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const plugins = useEnvironmentQuery(
    environmentId === null ? null : pluginEnvironment.list({ environmentId, input: {} }),
  ).data?.plugins;
  const writeStarter = useCallback(
    async (input: { readonly cwd: string; readonly folder: string; readonly stem: string }) => {
      if (environmentId === null) return;
      const step = await loadStarterStep();
      const files = [
        { path: `${input.folder}/${input.stem}.py`, contents: starterScript(input.stem) },
        { path: `${input.folder}/${input.stem}.step`, contents: starterStepAs(step, input.stem) },
      ];
      for (const file of files) {
        const written = await write({
          environmentId,
          input: { cwd: input.cwd, relativePath: file.path, contents: file.contents },
        });
        if (written._tag !== "Success") throw new Error(`${file.path} could not be written.`);
      }
    },
    [environmentId, write],
  );
  const open = useCallback(
    (threadRef: ScopedThreadRef, path: string) => {
      setSimpleView(false);
      useRightPanelStore.getState().setMaximized(threadRef, false);
      openInPanel(plugins, threadRef, path);
    },
    [plugins],
  );
  return { writeStarter, open };
}

/**
 * Home's New part, and New's Part on Home and the Projects page: a project named "Untitled part"
 * (`untitledName`, past every name of yours and Trash's) with the starter part in
 * `parts/part.py`, opened beside its new chat in CAD mode. No dialog and no agent turn; renaming
 * is Rename on the project. Resolves once it is open, or has said why it could not be made.
 */
export function useNewPart(environmentId: EnvironmentId): () => Promise<void> {
  const create = useCreateStudioProject(environmentId);
  const listStudioProjects = useAtomQueryRunner(studioProjectsEnvironment.list, {
    reportFailure: false,
    refresh: true,
  });
  const { writeStarter, open } = useWriteStarter(environmentId);
  return useCallback(() => {
    const running = underWay.get(environmentId);
    if (running !== undefined) return running;
    const work = (async () => {
      try {
        // Read now, not from the last render: a part may have been made a moment ago.
        const known = await listStudioProjects({ environmentId, input: {} });
        if (known._tag !== "Success") throw new Error("Studio's projects could not be read.");
        const name = untitledName(
          [...Object.values(known.value.projects), ...Object.values(known.value.trashed ?? {})].map(
            (project) => project.name,
          ),
        );
        const stem = partStem("part");
        await create({
          environmentId,
          name,
          kind: PART_KIND,
          units: "mm",
          material: "",
          purpose: "",
          folders: [],
          // A write that fails throws out of `create` before it says the project was made, and
          // the catch below says so, once.
          onFolder: (folder) => writeStarter({ cwd: folder, folder: PART_FOLDER, stem }),
          show: (ref) => open(ref, `${PART_FOLDER}/${stem}.step`),
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not make the part",
          description: plainError(error),
        });
      }
    })().finally(() => underWay.delete(environmentId));
    underWay.set(environmentId, work);
    return work;
  }, [create, environmentId, listStudioProjects, open, writeStarter]);
}

/**
 * New part in an open project: New's Part there, and the Overview's Start a part by hand. It
 * writes the starter as `<folder>/<name>.py` (`partStem`; `parts/part.py` from Start a part by
 * hand), the next name free beside what the folder holds so no file is written over, and opens it
 * beside the chat in CAD mode. Null without a chat or a folder.
 */
export function useAddPart(
  threadRef: ScopedThreadRef | null,
  cwd: string | null,
): ((input: { readonly name: string; readonly folder?: string }) => Promise<void>) | null {
  const environmentId = threadRef?.environmentId ?? null;
  const list = useAtomQueryRunner(projectEnvironment.listEntries, {
    reportFailure: false,
    refresh: true,
  });
  const { writeStarter, open } = useWriteStarter(environmentId);
  return useMemo(() => {
    if (threadRef === null || cwd === null) return null;
    const { environmentId } = threadRef;
    // What a folder of the project holds; a folder not there yet holds nothing. One that can't
    // be read throws, so nothing is written over a part in it.
    const filesIn = async (folder: string): Promise<ReadonlyArray<string>> => {
      const listed = await list({ environmentId, input: { cwd, directoryPath: folder } });
      if (listed._tag === "Success") return listed.value.entries.map((entry) => entry.path);
      const parent = folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : "";
      if (folder !== "" && !(await filesIn(parent)).includes(folder)) return [];
      throw new Error(`${folder || "The project's folder"} could not be read.`);
    };
    return async (input) => {
      try {
        const folder = input.folder?.trim().replace(/^\/+|\/+$/g, "") || PART_FOLDER;
        const stem = freePartStem(partStem(input.name), await filesIn(folder));
        await writeStarter({ cwd, folder, stem });
        open(threadRef, `${folder}/${stem}.step`);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not make the part",
          description: plainError(error),
        });
      }
    };
  }, [cwd, list, open, threadRef, writeStarter]);
}
