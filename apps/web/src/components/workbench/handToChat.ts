import type { ComposerHandleRef } from "~/composerHandleContext";

/**
 * Whether a job handed to the chat sends at once: it does into an empty composer; into a draft the
 * person is writing, it is added after their words and waits, so they see both and send.
 */
export function sendsAtOnce(draft: string): boolean {
  return draft.trim() === "";
}

/**
 * Hands a job to a chat (New, the Toolbox, ⌘K, the Overview): written into its composer, which
 * sends it once it holds it, unless the composer held a draft (`sendsAtOnce`).
 */
export function handToChat(composerRef: ComposerHandleRef, prompt: string): void {
  const composer = composerRef.current;
  if (composer === null) return;
  const send = sendsAtOnce(composer.readSnapshot().value);
  if (!composer.insertTextAtEnd(prompt, { ensureLeadingBoundary: true })) return;
  if (send) requestAnimationFrame(() => composer.submit());
}
