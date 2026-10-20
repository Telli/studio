import { useEffect } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { takePendingStart } from "./startProject";

/** About two seconds of frames to wait for the composer to mount. */
const FRAMES = 120;
/** A chat that cannot send yet (files still read, its provider still loading) ignores Send. */
const RETRY_MS = 250;
const TRIES = 60;

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
    const begin = () => {
      const composer = composerRef.current;
      if (composer === null) {
        if (++waited < FRAMES) frame = requestAnimationFrame(begin);
        return;
      }
      const start = takePendingStart(folder);
      if (start === null) return;
      if (start.files.length > 0) composer.addDroppedFiles([...start.files]);
      composer.insertTextAtEnd(start.prompt, { ensureLeadingBoundary: true });
      pressSendWhileHeld(composerRef, start.prompt.trim());
    };
    begin();
    return () => cancelAnimationFrame(frame);
  }, [composerRef, folder, notStarted]);
}

/**
 * Presses Send until the composer no longer holds `message`: sent, or changed by the person. A
 * press while a send is under way is ignored by the chat, so it goes once. This outlives the
 * effect that began it: React may run that effect twice, and the start is taken only once.
 */
function pressSendWhileHeld(composerRef: ComposerHandleRef, message: string): void {
  let tries = 0;
  const press = () => {
    const composer = composerRef.current;
    if (composer !== null && !composer.hasPendingAttachments()) {
      if (!composer.readSnapshot().value.includes(message)) return;
      composer.submit();
    }
    if (++tries < TRIES) window.setTimeout(press, RETRY_MS);
  };
  window.setTimeout(press, RETRY_MS);
}
