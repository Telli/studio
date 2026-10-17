import { useCallback, useEffect, useRef, useState } from "react";
import { createPromptContext, textPart } from "@text-to-cad/core/prompt";
import { useViewerHost } from "../../../host/context.js";
import {
  changeNote,
  changesSince,
  commandNote,
  commandUndoNote,
  deleteNote,
  deleteRefusal,
  emptyHistory,
  featureNames,
  featureTree,
  recordChange,
  redoStep,
  treeFeatures,
  treeIds,
  undoStep
} from "./editMode.js";
import { countChange, sketchNote } from "./sketchMode.js";

// How often the view asks whether the part's files changed (the agent's edits, another view's):
// an unchanged answer is a hash comparison on the server, and the part is not run.
const POLL_MS = 1500;
const describe = error => (error instanceof Error ? error.message : String(error || "The change could not be made."));
// A feature's title in the design tree a reply describes: "Fillet2".
const titleOf = (state, row) => treeFeatures(featureTree(state)).find(feature => feature.id === row)?.title
  || featureNames(state?.rows || []).find(name => name.key === row)?.title || "";
// A change worth a step of Undo: one that changed some line.
const changedLines = change => !change?.undo?.hunks || change.undo.hunks.length > 0;
// The sketch a session edits, as a request names it.
const sketchTarget = sketch => ({ file: sketch.file, line: sketch.line, name: sketch.name });

/**
 * Edit mode for the file on screen (`cadgen/edit`, through the CAD client): the part's script read
 * as a design, kept current while the view is up, one number of it changed by hand, the ribbon's
 * modeling commands (`command`, the one whose panel is open; `run` writes its line), and sketch
 * mode (`sketch`: the sketch being edited, solved again with each stroke, relation and
 * dimension). A change applies at once; the agent hears of it with the person's next message (a
 * note queued in the chat, never a message of its own), so it never starts work because of one.
 * A sketch's strokes are told once, when the person leaves the sketch.
 *
 * `status`: `probing` while the server says whether the file has a part script (the view stays as
 * it is), `reading` until the first answer, then `ready`, `none` (no part script beside this file,
 * or no edit mode on the server: nothing to edit, and the view stays as it was) or `error`.
 *
 * @param {{ client: object | null, file: string, active: boolean }} options
 */
export function useEditMode({ client, file, active }) {
  const host = useViewerHost();
  const supported = typeof client?.editState === "function" && typeof client?.editChange === "function";
  // `probing` until the server says whether the file has a part script: the view stays as it is.
  const [status, setStatus] = useState(supported && file ? "probing" : "none");
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  // The design tree's row under the pointer: a plane hovered there is drawn on the model.
  const [hovered, setHovered] = useState(null);
  const [history, setHistory] = useState(emptyHistory);
  const [command, setCommand] = useState(null);
  // Sketch mode: the sketch being edited, the tool in hand (none: select and drag), what is
  // selected in it, whether new strokes are construction geometry, and the Sketch command waiting
  // for a plane or a face to sketch on.
  const [sketch, setSketch] = useState(null);
  const [sketchTool, setSketchTool] = useState(null);
  const [sketchSelection, setSketchSelection] = useState([]);
  const [construction, setConstruction] = useState(false);
  const [picking, setPicking] = useState(false);
  // How many clicks the tool in hand has had, for its prompt ("Click the opposite corner").
  const [sketchStep, setSketchStep] = useState(0);
  // A press of Normal To: the view turns to look straight at the sketch again.
  const [normalTo, setNormalTo] = useState(0);
  const files = useRef(null);
  const probed = useRef("");
  const historyRef = useRef(history);
  historyRef.current = history;
  const sketchRef = useRef(sketch);
  sketchRef.current = sketch;

  // Another file is another part: everything starts again.
  useEffect(() => {
    files.current = null;
    setState(null); setError(""); setChoice(null); setSelected(null); setHistory(emptyHistory()); setCommand(null);
    setSketch(null); setSketchTool(null); setSketchSelection([]); setPicking(false);
    probed.current = "";
    setStatus(supported && file ? "probing" : "none");
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
    if (reply.sketchOnly) {
      // A sketch solved on its own: the part is as it was, its file's hash moved on.
      files.current = { ...(files.current || {}), ...(reply.files || {}) };
      setState(current => (current ? { ...current, building: reply.building } : current));
      return;
    }
    files.current = reply.files || null;
    setState(reply);
    setStatus("ready");
    setError("");
    // As a CAD tool opens a part: nothing selected until the person picks a feature. A selection
    // the part no longer has (its line removed) is let go.
    setSelected(current => (current && treeIds(featureTree(reply)).has(current) ? current : null));
    // The sketch being edited, as the part now makes it (the agent changed the file, say).
    setSketch(current => {
      if (!current) return current;
      const found = (reply.sketches || []).find(view => view.file === current.file && view.name === current.name);
      return found ? { ...current, ...found } : current;
    });
  }, []);

  useEffect(() => {
    if (!supported || !file || !active) return undefined;
    let stopped = false;
    let timer = null;
    const ask = async () => {
      if (stopped) return;
      // First only whether there is a part script to edit, answered at once: a file with none
      // (or a server without edit mode) keeps the viewer as it is, never laid out for editing.
      if (files.current === null && probed.current !== file) {
        try {
          const reply = await client.editState(file, null, { probe: true });
          if (stopped) return;
          probed.current = file;
          if (!reply?.editable) { setStatus("none"); return; }
          setStatus(current => (current === "probing" ? "reading" : current));
        } catch {
          if (!stopped) setStatus("none");
          return;
        }
      }
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

  // `note`: what the agent is told of the reply's change (a number's, unless said otherwise; null
  // tells nothing).
  const send = useCallback(async (request, { record = true, note } = {}) => {
    if (!supported || !file) return null;
    setSaving(true);
    setChoice(null);
    try {
      const reply = await client.editChange({ ...request, file, files: files.current || undefined });
      if (reply.choose) { setChoice({ request, options: reply.choose }); return reply; }
      if (!reply.ok) { setError(reply.error || "The change could not be made."); return reply; }
      setError("");
      take(reply);
      if (reply.change) {
        if (record && changedLines(reply.change)) setHistory(current => recordChange(current, reply.change));
        const said = note === null ? null : note ? note(reply) : reply.change.kind ? null : changeNote(reply.change);
        tell(said);
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
    const deleted = move.change.kind === "delete";
    const current = sketchRef.current;
    // In sketch mode a stroke's Undo answers with the sketch, solved again from its lines.
    const request = current && move.request.splice ? { ...move.request, sketch: sketchTarget(current) } : move.request;
    const reply = await send(request, { record: false,
      note: made ? () => commandUndoNote(move.change, move.change.title, redo)
        : deleted ? () => deleteNote(move.change, { undo: !redo, redo }) : null });
    if (!reply?.ok) return;
    setHistory(move.next);
    if (current) {
      if (reply.sketchOnly && reply.sketch) setSketch(session => (session ? { ...session, ...reply.sketch } : session));
      // The sketch itself undone: sketch mode ends with it.
      else if (!reply.sketchOnly && !(reply.sketches || []).some(view => view.file === current.file && view.name === current.name)) {
        setSketch(null); setSketchTool(null); setSketchSelection([]);
      }
    }
  }, [send]);
  const undo = useCallback(() => step(undoStep, false), [step]);
  const redo = useCallback(() => step(redoStep, true), [step]);

  /**
   * Delete on a row of the design tree, as SolidWorks' takes a feature out: its lines taken out of
   * the script, the sketch it was made from kept; a sketch of its own goes with its lines. A sketch
   * a feature was made from is deleted with that feature first.
   */
  const remove = useCallback(async (id, tree) => {
    const features = treeFeatures(tree);
    const owner = features.find(feature => feature.kind !== "Sketch" && feature.sketch?.id === id);
    if (owner) {
      setError(`${owner.sketch.title} is used by ${owner.title}. Delete ${owner.title} first, or ask the agent.`);
      return null;
    }
    const feature = features.find(each => each.id === id);
    if (!feature) return null;
    const reply = await send({ remove: { feature: feature.id, title: feature.title } }, { note: answer => deleteNote(answer.change) });
    if (reply?.ok) setSelected(null);
    else if (reply?.dependents) setError(deleteRefusal(reply, tree, feature.title));
    return reply;
  }, [send]);

  // ---- sketch mode ---------------------------------------------------------------------------

  // `before`: the change made last before the session began, so Undo and Discard Changes reach
  // back only over what came after it (a new sketch's own making too). As a CAD tool's sketcher,
  // Redo begins again with the session.
  const begin = useCallback((view, created, before = historyRef.current.done.at(-1) ?? null) => {
    setSketch({ ...view, created, made: {}, changed: false, before });
    setHistory(current => (current.undone.length ? { ...current, undone: [] } : current));
    setSketchTool(null);
    setSketchSelection([]);
    setSketchStep(0);
    setPicking(false);
    setCommand(null);
    // As a CAD tool opens a sketch: the tree's selection (the plane it was started on) let go.
    setSelected(null);
    setNormalTo(tick => tick + 1);
  }, []);

  /** A new sketch, on an origin plane (`"Top"`) or a flat face of the body (a selection item). */
  const startSketch = useCallback(async (plane, name = "") => {
    const before = historyRef.current.done.at(-1) ?? null;
    const reply = await send({ sketch: { op: { kind: "new", plane, name } } }, { note: null });
    if (reply?.ok && reply.sketch) begin(reply.sketch, true, before);
    return reply;
  }, [send, begin]);

  /** Edit Sketch: an existing constrained sketch opened in sketch mode. */
  const openSketch = useCallback(view => {
    if (!view?.state) {
      setError(view?.error || "This sketch cannot be solved as it is. Ask the agent to look at it.");
      return;
    }
    begin(view, false);
  }, [begin]);

  /** A stroke, relation, dimension, move or delete, written into the sketch and solved again. */
  const sketchOp = useCallback(async op => {
    const current = sketchRef.current;
    if (!current) return null;
    const reply = await send({ sketch: { ...sketchTarget(current), op } }, { note: null });
    if (reply?.ok) {
      setSketch(session => (session ? { ...session, ...(reply.sketch || {}), made: countChange(session.made, op),
        changed: session.changed || changedLines(reply.change) } : session));
      if (op.kind === "delete") setSketchSelection([]);
    }
    return reply;
  }, [send]);

  /** Exit Sketch: the part built again with it, and the agent told what changed. */
  const exitSketch = useCallback(async () => {
    const current = sketchRef.current;
    if (!current) return null;
    const changed = current.changed || current.created;
    const reply = await send({ sketch: { ...sketchTarget(current), op: { kind: "exit", changed } } },
      { record: false, note: changed ? () => sketchNote(current) : null });
    if (reply?.ok) {
      setSketch(null); setSketchTool(null); setSketchSelection([]);
      const tree = featureTree(reply);
      const owner = treeFeatures(tree).find(feature => feature.sketch?.file === current.file && feature.sketch?.line === current.line);
      if (owner) setSelected(owner.kind === "Sketch" ? owner.id : owner.sketch.id);
    }
    return reply;
  }, [send]);

  /** The sketch's changes in this session taken back, and sketch mode left, as SolidWorks' Cancel does. */
  const cancelSketch = useCallback(async () => {
    const current = sketchRef.current;
    if (!current) return;
    // Each change since the session began, last first; the history is walked here, not read back
    // from a render between them.
    let walked = historyRef.current;
    let gone = false;
    while (changesSince(walked, current.before) > 0) {
      const move = undoStep(walked);
      const reply = await send({ ...move.request, sketch: sketchTarget(current) }, { record: false, note: null });
      if (!reply?.ok) break;
      walked = move.next;
      historyRef.current = walked;
      setHistory(walked);
      if (!reply.sketchOnly) { gone = true; break; } // the sketch's own making undone
    }
    if (!gone) await send({ sketch: { ...sketchTarget(current), op: { kind: "exit", changed: changesSince(walked, current.before) > 0 } } }, { record: false, note: null });
    setSketch(null); setSketchTool(null); setSketchSelection([]);
  }, [send]);

  return {
    status, state, error, choice, saving, selected, hovered, command,
    select: setSelected,
    hover: setHovered,
    change, undo, redo, run, remove,
    open: id => { setError(""); setPicking(false); setCommand(id); },
    close: () => setCommand(null),
    // In sketch mode, Undo takes back the session's own changes only.
    canUndo: (sketch ? changesSince(history, sketch.before) : history.done.length) > 0 && !saving,
    canRedo: history.undone.length > 0 && !saving,
    choose: leaf => { if (choice) void send({ ...choice.request, leaf }); },
    dismissChoice: () => setChoice(null),
    dismissError: () => setError(""),
    sketch, sketchTool, sketchSelection, construction, picking, normalTo, sketchStep,
    setSketchTool: tool => { setSketchTool(tool); setSketchSelection([]); setSketchStep(0); },
    setSketchStep,
    selectInSketch: setSketchSelection,
    setConstruction,
    startPicking: () => { setError(""); setCommand(null); setPicking(true); },
    stopPicking: () => setPicking(false),
    lookNormalTo: () => setNormalTo(tick => tick + 1),
    startSketch, openSketch, sketchOp, exitSketch, cancelSketch,
  };
}
