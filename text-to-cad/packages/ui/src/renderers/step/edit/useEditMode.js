import { useCallback, useEffect, useRef, useState } from "react";
import { createPromptContext, referencePart, textPart } from "@text-to-cad/core/prompt";
import { useViewerHost } from "../../../host/context.js";
import { changeNote, defaultRow, emptyHistory, recordChange, redoStep, undoStep } from "./editMode.js";

// How often the view asks whether the part's files changed (the agent's edits, another view's):
// an unchanged answer is a hash comparison on the server, and the part is not run.
const POLL_MS = 1500;
const describe = error => (error instanceof Error ? error.message : String(error || "The change could not be made."));

/**
 * Edit mode for the file on screen (`cadgen/edit`, through the CAD client): the part's script read
 * as a design, kept current while the view is up, and one number of it changed by hand. A change
 * applies at once; the agent hears of it with the person's next message (a note queued in the
 * chat, never a message of its own), so it never starts work because of one.
 *
 * `status`: `reading` until the first answer, then `ready`, `none` (no part script beside this
 * file: nothing to edit, and the view stays as it was) or `error`.
 *
 * @param {{ client: object | null, file: string, resource: object | null, active: boolean }} options
 */
export function useEditMode({ client, file, resource, active }) {
  const host = useViewerHost();
  const supported = typeof client?.editState === "function" && typeof client?.editChange === "function";
  const [status, setStatus] = useState(supported && file ? "reading" : "none");
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(emptyHistory);
  const files = useRef(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  // Another file is another part: everything starts again.
  useEffect(() => {
    files.current = null;
    setState(null); setError(""); setChoice(null); setSelected(null); setHistory(emptyHistory());
    setStatus(supported && file ? "reading" : "none");
  }, [file, supported]);

  const take = useCallback(reply => {
    if (reply.unchanged) {
      setState(current => (current ? { ...current, building: reply.building } : current));
      return;
    }
    if (!reply.ok) {
      if (reply.reason === "no-script") { setStatus("none"); return; }
      setStatus(current => (current === "ready" ? current : "error"));
      setError(reply.error || "The part could not be read.");
      return;
    }
    files.current = reply.files || null;
    setState(reply);
    setStatus("ready");
    setError("");
    setSelected(current => (current && reply.rows?.some(row => row.key === current) ? current : defaultRow(reply)));
  }, []);

  useEffect(() => {
    if (!supported || !file || !active) return undefined;
    let stopped = false;
    let timer = null;
    const ask = async () => {
      if (stopped) return;
      if (typeof document === "undefined" || !document.hidden) {
        try { take(await client.editState(file, files.current)); }
        catch (failure) { if (!stopped) { setError(describe(failure)); setStatus(current => (current === "ready" ? current : "error")); } }
      }
      if (!stopped) timer = setTimeout(ask, POLL_MS);
    };
    void ask();
    return () => { stopped = true; clearTimeout(timer); };
  }, [client, file, active, supported, take]);

  // The note the agent reads with the person's next message.
  const tell = useCallback(change => {
    const port = host?.promptContext;
    if (!port?.deliver || !resource) return;
    try {
      const context = createPromptContext([
        textPart(changeNote(change), "hand-edit"),
        referencePart({ resource: { ...resource }, target: { kind: "whole-resource" } }, "file"),
      ]);
      void Promise.resolve(port.deliver(context)).catch(() => {});
    } catch {
      // A chat that takes no context: the change stands, the note is simply not queued.
    }
  }, [host, resource]);

  const send = useCallback(async (request, { record = true } = {}) => {
    if (!supported || !file) return null;
    setSaving(true);
    setChoice(null);
    try {
      const reply = await client.editChange({ ...request, file, files: files.current || undefined });
      if (reply.choose) { setChoice({ request, options: reply.choose }); return reply; }
      if (!reply.ok) { setError(reply.error || "The change could not be made."); return reply; }
      take(reply);
      if (reply.change) {
        if (record) setHistory(current => recordChange(current, reply.change));
        tell(reply.change);
      }
      return reply;
    } catch (failure) {
      setError(describe(failure));
      return null;
    } finally {
      setSaving(false);
    }
  }, [client, file, supported, take, tell]);

  const change = useCallback(request => send(request), [send]);
  const undo = useCallback(async () => {
    const step = undoStep(historyRef.current);
    if (!step) return;
    const reply = await send(step.request, { record: false });
    if (reply?.ok) setHistory(step.next);
  }, [send]);
  const redo = useCallback(async () => {
    const step = redoStep(historyRef.current);
    if (!step) return;
    const reply = await send(step.request, { record: false });
    if (reply?.ok) setHistory(step.next);
  }, [send]);

  return {
    status, state, error, choice, saving, selected,
    select: setSelected,
    change, undo, redo,
    canUndo: history.done.length > 0 && !saving,
    canRedo: history.undone.length > 0 && !saving,
    choose: leaf => { if (choice) void send({ ...choice.request, leaf }); },
    dismissChoice: () => setChoice(null),
    dismissError: () => setError(""),
  };
}
