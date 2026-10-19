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
  editCommand,
  featureNames,
  featureTree,
  REPICKS,
  recordChange,
  redoStep,
  sketchTreeId,
  suppressNote,
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
 * modeling commands (`command`, the one whose panel is open; `previewFeature` shows what its OK
 * would make, without writing it; `run` writes its line), and sketch
 * mode (`sketch`: the sketch being edited, solved again with each stroke, relation and
 * dimension). A change applies at once; the agent hears of it with the person's next message (a
 * note queued in the chat, never a message of its own), so it never starts work because of one.
 * A sketch's strokes are told once, when the person leaves the sketch.
 *
 * `status`: `probing` while the server says whether the file has a part script (the view stays as
 * it is), `reading` until the first answer, then `ready`, `none` (no part script beside this file,
 * or no edit mode on the server: nothing to edit, and the view stays as it was) or `error`; `idle`
 * when the part could be edited but is not read, the viewer laid out for the AI instead (`reading`
 * false: the server is only asked whether it has a part script).
 *
 * @param {{ client: object | null, file: string, active: boolean, reading?: boolean }} options
 */
export function useEditMode({ client, file, active, reading = true }) {
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
  // Edit Feature: the feature whose command's panel is open, filled with its values (its id, title,
  // command, values, what it keeps, and the sketch it is made from), and the rollback bar it puts
  // back when it closes, having rolled back to the feature for its edges or faces to be picked again.
  const [editing, setEditing] = useState(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  // The rollback bar, as the server last said it: above the tree item `item` (the line `before`),
  // with the body there as a STEP file (`step`) the view shows in place of the part's.
  const [bar, setBar] = useState(null);
  const barRef = useRef(bar);
  barRef.current = bar;
  // Sketch mode: the sketch being edited, the tool in hand (none: select and drag), what is
  // selected in it, whether new strokes are construction geometry, and the Sketch command waiting
  // for a plane or a face to sketch on.
  const [sketch, setSketch] = useState(null);
  const [sketchTool, setSketchTool] = useState(null);
  const [sketchSelection, setSketchSelection] = useState([]);
  const [construction, setConstruction] = useState(false);
  const [picking, setPicking] = useState(false);
  // The Sketch command's Offset distance: how far along its normal the plane picked is moved, as
  // typed in the part's units ("" for none).
  const [planeOffset, setPlaneOffset] = useState("");
  // How many clicks the tool in hand has had, for its prompt ("Click the opposite corner").
  const [sketchStep, setSketchStep] = useState(0);
  // A press of Normal To: the view turns to look straight at the sketch again.
  const [normalTo, setNormalTo] = useState(0);
  // The sketch tools' settings, kept for the session as their PropertyManager keeps them: Sketch
  // Fillet's radius, Offset Entities' distance, Reverse direction and Select chain.
  const [sketchSettings, setSketchSettings] = useState(() => ({ filletRadius: "", chamferDistance: "", offsetDistance: "", offsetReverse: false,
    offsetChain: true, polygonSides: "" }));
  // What the open command would make, for the view to preview before OK, as SolidWorks draws an
  // extrude in yellow while its PropertyManager is open: set by the command's panel.
  const [preview, setPreview] = useState(null);
  // Preview, for the commands the view cannot sweep itself: what OK would make, made by the server
  // without writing it (`cadgen/edit`), the material it adds and the material it takes away
  // (`{ key, status, added, removed, error }`). While a new one is made (`updating`) the last one
  // stays drawn; one that failed (`failed`) draws nothing and says why. `previewOn` is the panels'
  // Preview switch, kept for the session.
  const [featurePreview, setFeaturePreview] = useState(null);
  // What the Inspect group has open beside the commands: Mass Properties ("mass"), and its numbers.
  const [inspecting, setInspecting] = useState(null);
  const [mass, setMass] = useState(null);
  const [previewOn, setPreviewOn] = useState(true);
  const previewWanted = useRef(null);
  const previewAsked = useRef("");
  const previewAsking = useRef(false);
  // Where the face was clicked while Hole is open (`{ id, point, center, normal }`, the model's
  // frame), for the hole to go there.
  const [facePoint, setFacePoint] = useState(null);
  const files = useRef(null);
  const probed = useRef("");
  const historyRef = useRef(history);
  historyRef.current = history;
  const sketchRef = useRef(sketch);
  sketchRef.current = sketch;

  // Another file is another part: everything starts again.
  useEffect(() => {
    files.current = null;
    setState(null); setError(""); setChoice(null); setSelected(null); setHistory(emptyHistory()); setCommand(null); setEditing(null);
    setPreview(null);
    previewWanted.current = null; previewAsked.current = ""; setFeaturePreview(null);
    setBar(null);
    setSketch(null); setSketchTool(null); setSketchSelection([]); setPicking(false);
    probed.current = "";
    setStatus(supported && file ? "probing" : "none");
  }, [file, supported]);

  const take = useCallback(reply => {
    if (reply.unchanged) {
      setState(current => (current ? { ...current, building: reply.building } : current));
      // The rollback bar moved alone: the part as it was read, and the bar where it went.
      if ("bar" in reply) setBar(reply.bar);
      return;
    }
    if (!reply.ok) {
      if (reply.reason === "no-script") { setStatus("none"); return; }
      setStatus(current => (current === "ready" ? current : "error"));
      setError(reply.error || "The part could not be read.");
      return;
    }
    if (reply.sketchOnly) {
      // A sketch solved on its own: the part is as it was, its file's hash moved on, and only
      // where the rollback bar is (its lines may have moved it).
      files.current = { ...(files.current || {}), ...(reply.files || {}) };
      setState(current => (current ? { ...current, building: reply.building } : current));
      if ("bar" in reply) setBar(current => (current && reply.bar ? { ...current, ...reply.bar } : reply.bar));
      return;
    }
    files.current = reply.files || null;
    setState(reply);
    if ("bar" in reply) setBar(reply.bar);
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
          setStatus(current => (current === "probing" ? (reading ? "reading" : "idle") : current));
        } catch {
          if (!stopped) setStatus("none");
          return;
        }
      }
      // Laid out for the AI, the part is not run: only whether it could be edited is known.
      if (stopped || !reading) return;
      setStatus(current => (current === "idle" ? "reading" : current));
      if (typeof document === "undefined" || !document.hidden) {
        // While the bar is up, the server says it again with the part, in case the file moved it.
        // A bar still on its way (`pending`) is where it was moved to, not where it was.
        const current = barRef.current;
        const bar = current ? [{ bar: current.pending ? { item: current.item } : { before: current.before } }] : [];
        try { take(await client.editState(file, files.current, ...bar)); }
        catch (failure) { if (!stopped) { setError(describe(failure)); setStatus(current => (current === "ready" ? current : "error")); } }
      }
      if (!stopped) timer = setTimeout(ask, POLL_MS);
    };
    void ask();
    return () => { stopped = true; clearTimeout(timer); };
  }, [client, file, active, reading, supported, take]);

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
      // Every change is made where the rollback bar is, unless the request says where.
      const placed = "bar" in request || !barRef.current ? request : { ...request, bar: { before: barRef.current.before } };
      const reply = await client.editChange({ ...placed, file, files: files.current || undefined });
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

  // No preview wanted, or drawn: the panel shut, or what it shows no longer the panel's.
  const dropPreview = useCallback(() => {
    previewWanted.current = null;
    previewAsked.current = "";
    setFeaturePreview(null);
  }, []);
  // One preview is made at a time: the newest wanted waits for it, and any asked between is dropped.
  // Each carries what it is asked with (its file, the part's files and the rollback bar as it was
  // asked), so one wanted for another file is never sent for this one's.
  const askPreview = useCallback(async () => {
    if (previewAsking.current) return;
    previewAsking.current = true;
    try {
      while (previewWanted.current) {
        const wanted = previewWanted.current;
        let shown;
        try {
          const reply = await wanted.client.editChange({ preview: wanted.request, ...wanted.bar, file: wanted.file, files: wanted.files });
          const made = reply?.ok ? reply.preview || {} : { error: reply?.error || "The preview could not be made." };
          shown = made.error ? { status: "failed", added: null, removed: null, error: made.error }
            : { status: "ready", added: made.added || null, removed: made.removed || null, error: "" };
        } catch (failure) {
          shown = { status: "failed", added: null, removed: null, error: describe(failure) };
        }
        // Shown only while it is still the one wanted.
        if (previewWanted.current === wanted) {
          previewWanted.current = null;
          setFeaturePreview({ key: wanted.key, ...shown });
        }
      }
    } finally {
      previewAsking.current = false;
    }
  }, []);
  /**
   * Preview: what the open panel's OK would send (`request`), made by the server without writing
   * it, as a CAD tool previews a feature before OK; null for none. Asked again only when the
   * request, the part's files (the agent's edit) or the rollback bar changed.
   */
  const previewFeature = useCallback(request => {
    if (!request || !supported || !file) { dropPreview(); return; }
    const bar = barRef.current ? { bar: { before: barRef.current.before } } : {};
    const key = JSON.stringify([request, files.current, bar]);
    if (key === previewAsked.current) return;
    previewAsked.current = key;
    previewWanted.current = { key, request, client, file, files: files.current || undefined, bar };
    setFeaturePreview(current => ({ key, status: "updating", added: current?.added ?? null, removed: current?.removed ?? null, error: "" }));
    void askPreview();
  }, [supported, client, file, dropPreview, askPreview]);

  /**
   * Mass Properties, as SolidWorks' Evaluate tab opens them: the part's volume, surface area, center
   * of mass and size as the server works them out, at the rollback bar where it is up, asked again
   * whenever the part is read again; the last kept while the next is made.
   */
  useEffect(() => {
    if (inspecting !== "mass" || !supported || !file) { setMass(null); return undefined; }
    let gone = false;
    setMass(current => ({ ...(current || {}), status: "updating" }));
    const placed = barRef.current ? { bar: { before: barRef.current.before } } : {};
    client.editChange({ mass: {}, ...placed, file, files: files.current || undefined }).then(reply => {
      if (gone) return;
      const made = reply?.ok ? reply.mass || {} : { error: reply?.error || "The mass properties could not be worked out." };
      setMass(made.error ? { status: "failed", error: made.error } : { status: "ready", ...made });
    }, failure => { if (!gone) setMass({ status: "failed", error: describe(failure) }); });
    return () => { gone = true; };
  }, [inspecting, supported, file, client, state, bar?.before]);

  // A command's OK: its line written after the body, the new feature selected and its panel shut.
  const run = useCallback(async request => {
    // Edit Feature rolled back to the feature: its line written there, then the bar put back.
    const rolled = editingRef.current?.rolled;
    const placed = rolled ? { bar: barRef.current ? { before: barRef.current.before } : null, bar_after: editingRef.current.previousBar } : {};
    const reply = await send({ command: request, ...placed }, { record: false,
      note: answer => commandNote(answer.change, titleOf(answer, answer.change.row)) });
    if (reply?.ok && reply.change) {
      const title = titleOf(reply, reply.change.row);
      setHistory(current => recordChange(current, { ...reply.change, title }));
      setSelected(reply.change.row);
      setCommand(null);
      setEditing(null);
      dropPreview();
    }
    return reply;
  }, [send, dropPreview]);

  /**
   * Edit Feature, as SolidWorks' reopens a feature's PropertyManager: the command that made it,
   * filled with its values. Its OK writes the feature's line again (`run`, with `replace`).
   */
  const editFeature = useCallback(feature => {
    if (!feature?.edit) return;
    setError(""); setPicking(false);
    setSelected(feature.id);
    // A fillet's edges, a shell's or a hole's faces, are picked again on the body before the
    // feature, as SolidWorks rolls back to a feature it edits.
    const rolled = REPICKS.has(feature.edit.command) && Boolean(editCommand(feature.edit.command)?.picks);
    const previousBar = barRef.current ? { before: barRef.current.before } : null;
    dropPreview();
    setEditing({ ...feature.edit, id: feature.id, title: feature.title, sketch: feature.sketch, rolled, previousBar });
    setCommand(feature.edit.command);
    if (rolled) void send({ bar: { item: feature.id } }, { record: false, note: null });
  }, [send, dropPreview]);

  /**
   * Rollback, as SolidWorks' rollback bar: the part shown as it was above a tree item (`item`, its
   * id), its features below it left out, until it is rolled to the end (null). Commands then act
   * on the body there and write their line at the bar.
   */
  const rollTo = useCallback(async item => {
    if (!item) { setBar(null); return null; }
    // The bar moves in the tree at once, as SolidWorks moves it; the body there follows, the one
    // shown until then kept (`pending`). Refused, it goes back where it was.
    const before = barRef.current;
    setBar(current => ({ ...(current || {}), item, pending: true }));
    const reply = await send({ bar: { item } }, { record: false, note: null });
    if (!reply?.ok) setBar(before);
    return reply;
  }, [send]);

  // Edit Feature's panel shut (Cancel, or another command opened): its own rollback ends, and the
  // bar goes back where it was.
  const endEditing = useCallback(() => {
    const current = editingRef.current;
    setEditing(null);
    if (!current?.rolled) return;
    if (current.previousBar) void send({ bar: current.previousBar }, { record: false, note: null });
    else setBar(null);
  }, [send]);
  const step = useCallback(async (next, redo) => {
    const move = next(historyRef.current);
    if (!move) return;
    const made = move.change.kind === "command";
    const deleted = move.change.kind === "delete";
    const suppressed = move.change.kind === "suppress";
    const current = sketchRef.current;
    // In sketch mode a stroke's Undo answers with the sketch, solved again from its lines.
    const request = current && move.request.splice ? { ...move.request, sketch: sketchTarget(current) } : move.request;
    const reply = await send(request, { record: false,
      note: made ? () => commandUndoNote(move.change, move.change.title, redo)
        : deleted ? () => deleteNote(move.change, { undo: !redo, redo })
          : suppressed ? () => suppressNote(move.change, { undo: !redo, redo }) : null });
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

  /**
   * Suppress (`on`) or Unsuppress on a feature of the design tree, as SolidWorks' sets one aside:
   * its lines kept in the script as comments, the feature greyed where it is; or put back as they
   * were. The feature stays selected, by its title, which its place in the tree keeps.
   */
  const suppress = useCallback(async (id, tree, on = true) => {
    const feature = treeFeatures(tree).find(each => each.id === id);
    if (!feature || feature.kind === "Sketch") return null;
    const reply = await send({ suppress: { feature: feature.id, title: feature.title, on } }, { note: answer => suppressNote(answer.change) });
    if (reply?.ok) setSelected(treeFeatures(featureTree(reply)).find(each => each.title === feature.title)?.id ?? null);
    else if (reply?.dependents) setError(deleteRefusal(reply, tree, feature.title, "Suppress"));
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
    setEditing(null);
    dropPreview();
    // As a CAD tool opens a sketch: the tree's selection (the plane it was started on) let go.
    setSelected(null);
    setNormalTo(tick => tick + 1);
  }, [dropPreview]);

  /** A new sketch, on an origin plane (`"Top"`) or a flat face of the body (a selection item). */
  const startSketch = useCallback(async (plane, name = "", offset = "") => {
    const before = historyRef.current.done.at(-1) ?? null;
    const moved = String(offset ?? "").trim();
    const reply = await send({ sketch: { op: { kind: "new", plane, name, ...(moved ? { offset: moved } : {}) } } }, { note: null });
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
      // The sketch made stays selected, as SolidWorks leaves it, for the feature to take it.
      const id = sketchTreeId(featureTree(reply), current);
      if (id) setSelected(id);
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
    status, state, error, choice, saving, selected, hovered, command, editing, bar,
    // The bar moved in the tree, the body there still on its way.
    rolling: Boolean(bar?.pending),
    select: setSelected,
    hover: setHovered,
    change, undo, redo, run, remove, suppress, editFeature, rollTo,
    open: id => { setError(""); setPicking(false); setInspecting(null); endEditing(); setPreview(null); dropPreview(); setFacePoint(null); setCommand(id); },
    inspecting, mass,
    inspect: what => { setCommand(null); endEditing(); setPicking(false); setPreview(null); dropPreview(); setInspecting(what); },
    stopInspecting: () => setInspecting(null),
    close: () => { setCommand(null); endEditing(); setPreview(null); dropPreview(); setFacePoint(null); },
    preview, setPreview, facePoint, setFacePoint,
    featurePreview, previewFeature, previewOn, setPreviewOn,
    // In sketch mode, Undo takes back the session's own changes only.
    canUndo: (sketch ? changesSince(history, sketch.before) : history.done.length) > 0 && !saving,
    canRedo: history.undone.length > 0 && !saving,
    choose: leaf => { if (choice) void send({ ...choice.request, leaf }); },
    dismissChoice: () => setChoice(null),
    dismissError: () => setError(""),
    sketch, sketchTool, sketchSelection, construction, picking, normalTo, sketchStep,
    // Mirror Entities starts from what is selected; every other tool from nothing.
    setSketchTool: tool => { setSketchTool(tool); if (tool !== "mirror") setSketchSelection([]); setSketchStep(0); },
    sketchSettings,
    setSketchSettings: patch => setSketchSettings(current => ({ ...current, ...patch })),
    setSketchStep,
    selectInSketch: setSketchSelection,
    setConstruction,
    startPicking: () => { setError(""); setCommand(null); setInspecting(null); endEditing(); dropPreview(); setPlaneOffset(""); setPicking(true); },
    planeOffset, setPlaneOffset,
    stopPicking: () => setPicking(false),
    lookNormalTo: () => setNormalTo(tick => tick + 1),
    startSketch, openSketch, sketchOp, exitSketch, cancelSketch,
  };
}
