import { useEffect } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { takePendingStart } from "./startProject";

/** About two seconds of frames to wait for the composer, then for its files to be read. */
const FRAMES = 120;

/**
 * Sends a new project's first message, set by Home's Start (`useStartProject.ts`), once the
 * project's new chat has a composer: its files first, then the text, then Send, as the person
 * would. Only in a chat not started yet, and only once (`takePendingStart`).
 */
export function usePendingStart(
  composerRef: ComposerHandleRef | null,
  folder: string | null,
  notStarted: boolean,
): void {
  useEffect(() => {
    if (composerRef === null || folder === null || !notStarted) return;
    let frame = 0;
    let waited = 0;
    const later = (step: () => void) => {
      if (++waited < FRAMES) frame = requestAnimationFrame(step);
    };
    const begin = () => {
      const composer = composerRef.current;
      if (composer === null) return later(begin);
      const start = takePendingStart(folder);
      if (start === null) return;
      if (start.files.length > 0) composer.addDroppedFiles([...start.files]);
      composer.insertTextAtEnd(start.prompt, { ensureLeadingBoundary: true });
      waited = 0;
      const send = () => {
        if (composer.hasPendingAttachments()) return later(send);
        composer.submit();
      };
      frame = requestAnimationFrame(send);
    };
    begin();
    return () => cancelAnimationFrame(frame);
  }, [composerRef, folder, notStarted]);
}
