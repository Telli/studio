import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";
import { useCallback, useState } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useRightPanelStore } from "~/rightPanelStore";
import { toastManager } from "../ui/toast";
import { BRIEF_REFERENCES } from "./briefFolder";
import { plainError } from "./importIntoProject";
import type { NewJob } from "./NewDialog";
import { humanName } from "./partNames";
import type { ListedProject } from "./projectList";
import {
  nameFromAttachment,
  provisionalProjectName,
  referencePaths,
  setPendingStart,
  type StartAttachment,
  startMessage,
} from "./startProject";
import { readStudioImport } from "./studioImportBridge";
import { useCreateStudioProject } from "./useCreateStudioProject";

/**
 * How Home starts work: from a description and what is attached, in a new project or as a new
 * chat in one of yours (`project`), or from New (a part, a board, a PRD) in a new project.
 */
export type ProjectStart =
  | {
      readonly kind: "described";
      readonly description: string;
      /** Files and folders for the project, copied into its References; with none, only words. */
      readonly attachments: ReadonlyArray<StartAttachment>;
      /** The project to start a chat in; null makes a new one. */
      readonly project: ListedProject | null;
    }
  | { readonly kind: "new"; readonly job: NewJob };

/**
 * Copies files and folders into a project folder's References (`brief/references`), as Import
 * into a project copies, never over a file there, and resolves to the copies' paths in the
 * folder. Outside the desktop app nothing is copied; a failed copy says so, and the start goes on.
 */
async function copyIntoReferences(
  folder: string,
  paths: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
  const bridge = readStudioImport();
  if (bridge === null || paths.length === 0) return [];
  try {
    const into = `${folder.replace(/[\\/]+$/, "")}/${BRIEF_REFERENCES}`;
    return referencePaths(await bridge.copy(paths, into));
  } catch (error) {
    toastManager.add({
      type: "error",
      title: "Could not copy your files into the project",
      description: plainError(error),
    });
    return [];
  }
}

/**
 * A project started from New is named by what New names: "Servo bracket", else as new work of its
 * kind, "New board", "New FMEA" (a word in capitals stays as it is).
 */
export function newProjectName(job: Pick<NewJob, "template" | "name">): string {
  const name = job.name.trim();
  if (name !== "" && name !== job.template.defaultName) return humanName(name);
  const label = job.template.label;
  const firstWord = label.split(" ")[0] ?? label;
  const lead =
    firstWord === firstWord.toUpperCase() ? label.charAt(0) : label.charAt(0).toLowerCase();
  return `New ${lead}${label.slice(1)}`;
}

const kindOf = (id: string) => STUDIO_PROJECT_KINDS.find((kind) => kind.id === id)!;

/**
 * Home's Start: makes the project (a new folder with its repository, `useCreateStudioProject`)
 * and opens its first chat, which sends the description, or New's job, as its first message
 * (`usePendingStart`), the way New in a project hands its job to the open chat. With a project of
 * yours chosen, it opens a new chat there instead, which sends the description the same way.
 * What was attached is copied into the project's References first, and the first message asks
 * the agent to read it before anything else (`startMessage`): a new project is set up from it.
 */
/**
 * Starts work as `useStartProject` does, one start at a time, from Home's box or from New on Home
 * and the Projects page: a second press while one is being made does nothing. `busy` says one is.
 */
export function useStartOnce(environmentId: EnvironmentId): {
  readonly busy: boolean;
  readonly start: (work: ProjectStart) => Promise<void>;
} {
  const startProject = useStartProject(environmentId);
  const [busy, setBusy] = useState(false);
  const start = async (work: ProjectStart) => {
    if (busy) return;
    setBusy(true);
    try {
      await startProject(work);
    } finally {
      setBusy(false);
    }
  };
  return { busy, start };
}

export function useStartProject(environmentId: EnvironmentId) {
  const create = useCreateStudioProject(environmentId);
  const handleNewThread = useNewThreadHandler();

  return useCallback(
    async (start: ProjectStart): Promise<boolean> => {
      const units = "mm" as const;
      if (start.kind === "described") {
        const description = start.description.trim();
        const { attachments } = start;
        if (description === "" && attachments.length === 0) return false;
        const paths = attachments.flatMap((attachment) => attachment.path ?? []);
        // What has no path on this computer goes with the first message, as a chat attaches it.
        const files = attachments.flatMap((attachment) =>
          attachment.path === null && attachment.file !== null ? [attachment.file] : [],
        );
        const prepare = async (folder: string, newProject: boolean) => {
          const references = await copyIntoReferences(folder, paths);
          setPendingStart(folder, {
            prompt: startMessage({ description, references, attached: files.length, newProject }),
            files,
          });
        };
        const folder = start.project?.folder ?? null;
        if (start.project !== null) {
          if (folder === null) return false;
          await prepare(folder.workspaceRoot, false);
          const draft = await handleNewThread(scopeProjectRef(folder.environmentId, folder.id));
          // The new chat in front, where its first message shows going out.
          if (draft !== null) {
            const ref = scopeThreadRef(folder.environmentId, draft.threadId);
            useRightPanelStore.getState().setMaximized(ref, false);
          }
          return draft !== null;
        }
        return create({
          environmentId,
          // Started from files alone, it is named after the first until the agent names it.
          name:
            description === ""
              ? nameFromAttachment(attachments[0]!.name)
              : provisionalProjectName(description),
          kind: kindOf("part"),
          units,
          material: "",
          purpose: description,
          folders: [],
          onFolder: (folder) => prepare(folder, true),
        });
      }
      const { job } = start;
      return create({
        environmentId,
        name: newProjectName(job),
        kind: kindOf(job.template.id === "board" ? "board" : "part"),
        units: job.units,
        material: "",
        purpose: "",
        folders: [],
        onFolder: (folder) => setPendingStart(folder, { prompt: job.prompt, files: [] }),
      });
    },
    [create, environmentId, handleNewThread],
  );
}
