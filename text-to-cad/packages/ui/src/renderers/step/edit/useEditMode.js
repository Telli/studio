import { useCallback, useEffect, useRef, useState } from "react";
import { createPromptContext, textPart } from "@text-to-cad/core/prompt";
import { useViewerHost } from "../../../host/context.js";
import {
  changeNote,
  commandNote,
  commandUndoNote,
  emptyHistory,
  featureNames,
  featureTree,
  recordChange,
  redoStep,
  treeFeatures,
  treeIds,
  undoStep
} from "./editMode.js";

// How often the view asks whether the part's files changed (the agent's edits, another view's):
// an unchanged answer is a hash comparison on the server, and the part is not run.
const POLL_MS = 1500;
const describe = error => (error instanceof Error ? error.message : String(error || "The change could not be made."));
// A feature's title in the design tree a reply describes: "Fillet2".
const titleOf = (state, row) => treeFeatures(featureTree(state)).find(feature => feature.id === row)?.title
  || featureNames(state?.rows || []).find(name => name.key === row)?.title || "";

/**
 * Edit mode for the file on screen (`cadgen/edit`, through the CAD client): the part's script read
 * as a design, kept current while the view is up, one number of it changed by hand, and the
 * ribbon's modeling commands (`command`, the one whose panel is open; `run` writes its line). A
 * change applies at once; the agent hears of it with the person's next message (a note queued in
 * the chat, never a message of its own), so it never starts work because of one.
 *
 * `status`: `reading` until the first answer, then `ready`, `none` (no part script beside this
 * file: nothing to edit, and the view stays as it was) or `error`.
 *
 * @param {{ client: object | null, file: string, active: boolean }} options
 */
export function useEditMode({ client, file, active }) {
  const host = useViewerHost();
  const supported = typeof client?.editState === "function" && typeof client?.editChange === "function";
  const [status, setStatus] = useState(supported && file ? "reading" : "none");
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  // The design tree's row under the pointer: a plane hovered there is drawn on the model.
  const [hovered, setHovered] = useState(null);
  const [history, setHistory] = useState(emptyHistory);
  const [command, setCommand] = useState(null);
  const files = useRef(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  // Another file is another part: everything starts again.
  useEffect(() => {
    files.current = null;
    setState(null); setError(""); setChoice(null); setSelected(null); setHistory(emptyHistory()); setCommand(null);
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
    // As a CAD tool opens a part: nothing selected until the person picks a feature. A selection
    // the part no longer has (its line removed) is let go.
    setSelected(current => (current && treeIds(featureTree(reply)).has(current) ? current : null));
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
  const tell = useCallback(note => {
    const port = host?.promptContext;
    if (!port?.deliver || !note) return;
    try {
      // The note names the script and its line; a reference to the file would add the STEP's
      // absolute path to the person's message (Studio writes context into the composer).
      const context = createPromptContext([textPart(note, "hand-edit")]);
      void Promise.resolve(port.deliver(context)).catch(() => {});
    } catch {
      // A chat that takes no context: the change stands, the note is simply not queued.
    }
  }, [host]);

  // `note`: what the agent is told of the reply's change (a number's, unless said otherwise).
  const send = useCallback(async (request, { record = true, note = null } = {}) => {
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
        tell(note ? note(reply) : changeNote(reply.change));
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
  // A command's OK: its line written after the body, the new feature selected and its panel shut.
  const run = useCallback(async request => {
    const reply = await send({ command: request }, { record: false,
      note: answer => commandNote(answer.change, titleOf(answer, answer.change.row)) });
    if (reply?.ok && reply.change) {
      const title = titleOf(reply, reply.change.row);
      setHistory(current => recordChange(current, { ...reply.change, title }));
      setSelected(reply.change.row);
      setCommand(null);
    }
    return reply;
  }, [send]);
  const step = useCallback(async (next, redo) => {
    const move = next(historyRef.current);
    if (!move) return;
    const made = move.change.kind === "command";
    const reply = await send(move.request, { record: false,
      note: made ? () => commandUndoNote(move.change, move.change.title, redo) : null });
    if (reply?.ok) setHistory(move.next);
  }, [send]);
  const undo = useCallback(() => step(undoStep, false), [step]);
  const redo = useCallback(() => step(redoStep, true), [step]);

  return {
    status, state, error, choice, saving, selected, hovered, command,
    select: setSelected,
    hover: setHovered,
    change, undo, redo, run,
    open: id => { setError(""); setCommand(id); },
    close: () => setCommand(null),
    canUndo: history.done.length > 0 && !saving,
    canRedo: history.undone.length > 0 && !saving,
    choose: leaf => { if (choice) void send({ ...choice.request, leaf }); },
    dismissChoice: () => setChoice(null),
    dismissError: () => setError(""),
  };
}
