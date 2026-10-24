import { useMemo } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { NEW_TEMPLATES, newWorkPrompt } from "./newTemplates";
import { setSimpleView } from "./simpleView";
import { pressSendWhileHeld } from "./usePendingStart";

const PART = NEW_TEMPLATES.find((template) => template.id === "part")!;

/**
 * Starts a blank part to model by hand in a project that has none, as Home's Part does for a new
 * project: Simple view turns off, so the part opens in the full workspace, and the part's job goes
 * to the chat, where the agent makes it and opens it. Sent at once from an empty composer; beside a
 * message the person is writing, it is added for them to send. Null without a composer or a folder.
 */
export function useStartPartByHand(input: {
  readonly composerRef: ComposerHandleRef | null;
  readonly folder: string | null;
  readonly units: "mm" | "in";
}): (() => void) | null {
  const { composerRef, folder, units } = input;
  return useMemo(() => {
    if (composerRef === null || folder === null) return null;
    return () => {
      const composer = composerRef.current;
      if (composer === null) return;
      setSimpleView(false);
      const job = newWorkPrompt({
        template: PART,
        name: PART.defaultName,
        folder: PART.folder,
        units,
        part: null,
        description: "",
      });
      const writing = composer.readSnapshot().value.trim() !== "";
      composer.insertTextAtEnd(job, { ensureLeadingBoundary: true });
      if (writing) composer.focusAtEnd();
      else pressSendWhileHeld(composerRef, job);
    };
  }, [composerRef, folder, units]);
}
