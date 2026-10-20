import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";

import { useComposerHandleContext } from "~/composerHandleContext";
import { usePendingStart } from "./usePendingStart";

/**
 * Sends a new project's first message, from Home, once the project's new chat has a composer
 * (`usePendingStart`). It shows nothing: the project's chats are listed down the left, in the
 * sidebar (`StudioSidebar`).
 */
export function PendingStart(props: {
  readonly project: EnvironmentProject | null;
  /** A chat not started yet (a draft): only it sends the first message. */
  readonly draft: boolean;
}) {
  usePendingStart(useComposerHandleContext(), props.project?.workspaceRoot ?? null, props.draft);
  return null;
}
