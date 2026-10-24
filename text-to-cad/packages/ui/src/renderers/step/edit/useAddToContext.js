/**
 * Add to context in the workspace (`StepSurface.jsx` wires it): the selection bar's button and the toolbar's put what Ask would
 * carry into the host's chat box, with no note and nothing sent, so faces, edges and features can be collected and one message
 * written (`quickEditPrompt.js`'s `addToContext`, which is what Quick Edit's Queue does without the note).
 */
import { useCallback, useMemo, useRef } from "react";
import { usePromptDestination, useViewerHost } from "../../../host/context.js";
import {
  addToContext, canAddToContext, deliveryFailure, promptAttachments, quickEditSelection
} from "../../kit/tools/quick-edit/quickEditPrompt.js";

/**
 * Add to context for what is picked (`references`, in the prompt grammar: what Ask carries, `pickedReferences`) in the file on
 * screen (`resource`). `add()` hands them to the host within the press, with the views and files the Quick Edit `prompt` would
 * attach and none that Queue would not, and takes one press at a time. Once the host has them `onAdded()` is called, for the
 * surface to let go of the picks so the next one starts fresh; if it does not take them `onFailed(message)` is, with the picks
 * kept, in the words Quick Edit shows under its note.
 *
 * `offered`: the host has a chat box to fill (`canAddToContext`), and Add to context is shown nowhere else. `picked`: there is
 * something to add, beyond the file, which always goes; `add()` with nothing picked does nothing.
 *
 * @param {{ resource: object, references: readonly object[], prompt: object | null, onAdded: () => void, onFailed: (message: string) => void }} input
 * @returns {{ offered: boolean, picked: boolean, add: () => void }}
 */
export function useAddToContext({ resource, references, prompt, onAdded, onFailed }) {
  const host = useViewerHost();
  const destination = usePromptDestination();
  const picks = useMemo(() => quickEditSelection(references), [references]);
  // What a press reads is what is live then, and what settles it is what is live when the host answers.
  const live = useRef(null);
  live.current = { host, resource, picks, prompt, onAdded, onFailed };
  const pending = useRef(false);
  const add = useCallback(() => {
    const { host: now, resource: file, picks: carried, prompt: source } = live.current;
    if (pending.current || !carried.length) return;
    pending.current = true;
    let outcome;
    try { outcome = addToContext(now, { resource: file, references: carried, ...promptAttachments(source) }); }
    catch (caught) { outcome = Promise.reject(caught); }
    outcome.then(
      result => deliveryFailure(result),
      caught => (caught instanceof Error ? caught.message : String(caught)) || "The prompt did not go.",
    ).then(message => {
      pending.current = false;
      if (message) live.current.onFailed(message); else live.current.onAdded();
    });
  }, []);
  return { offered: canAddToContext(destination), picked: picks.length > 0, add };
}
