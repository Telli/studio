import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  FILE_SHEET_STATUS_TEXT_CLASSES,
  FileSheetCheckboxRow,
  FileSheetControlRow,
  FileSheetSelectRow,
  FileSheetSettingsSection,
  FileSheetValueInput
} from "../../kit/inspector/FileSheet.js";
import {
  clickOffsets,
  commandBlocked,
  edgeAxis,
  commandDefaults,
  commandRequest,
  editCommand,
  editingValues,
  faceOffsetAxes,
  REPICKS,
  partSide,
  revolveAxes,
  sameValues,
  selectionItems,
  selectionLabel,
  sizeName,
  sketchView,
  treeSketch
} from "./editMode.js";
import { COMMAND_ICONS } from "./cadIcons.jsx";
import { ConfirmButtons } from "./ConfirmButtons.jsx";
import { sketchGeometry } from "./sketchMode.js";
// An extrude's end conditions, as SolidWorks' Direction 1 names them; a cut can go through all.
const BOSS_ENDS = Object.freeze([{ value: "blind", label: "Blind" }, { value: "next", label: "Up To Next" }, { value: "mid", label: "Mid Plane" }]);
const CUT_ENDS = Object.freeze([...BOSS_ENDS, { value: "through", label: "Through All" }]);
// Hole Wizard's types: a plain hole, or one with a counterbore or a countersink for a screw's head.
const HOLE_TYPES = Object.freeze([{ value: "simple", label: "Hole" }, { value: "counterbore", label: "Counterbore" },
  { value: "countersink", label: "Countersink" }]);
const UNIT_MARKS = Object.freeze({ mm: "mm", in: "in" });
const LISTED = 8;
const PLANES = Object.freeze([{ value: "XY", label: "XY plane" }, { value: "XZ", label: "XZ plane" }, { value: "YZ", label: "YZ plane" }]);
const PATTERNS = Object.freeze([{ value: "linear", label: "Linear" }, { value: "circular", label: "Circular" }]);
const DIRECTIONS = Object.freeze([{ value: "X", label: "Along X" }, { value: "Y", label: "Along Y" }]);
// A mirror Edit Feature reopens that was made about a face of the part: that face again.
const SAME_FACE = Object.freeze({ value: "face", label: "Same face" });
const MM_PER = Object.freeze({ mm: 1, in: 25.4 });

/** A number the command takes, typed over as the design tree's are, with its unit. */
function NumberRow({ label, value, unit = "", disabled, onChange }) {
  return <FileSheetControlRow label={label} trailing={<span className="flex shrink-0 items-center gap-1">
    <FileSheetValueInput value={value} ariaLabel={label} disabled={disabled} onValueCommit={draft => onChange(String(draft).trim())} />
    <span className="w-4 text-micro text-muted-foreground">{UNIT_MARKS[unit] || unit}</span>
  </span>} />;
}

/**
 * A selection box as SolidWorks' PropertyManager draws one: what the command acts on, each marked
 * in the blue the model shows it picked in, with an X to let it go (`onClear`); empty, it waits in
 * that blue for a pick and says what to pick.
 */
function SelectionBox({ items, prompt, more = 0, onClear = null, clearLabel = "Clear" }) {
  if (!items.length) {
    return <p role="status" className="mx-2 mb-1 rounded-md border border-dashed border-cad-picked/70 bg-cad-picked/5 px-2 py-1.5 text-tiny leading-4 text-foreground">
      {prompt}</p>;
  }
  return <ul aria-label="Selected" className="mx-2 mb-1 flex flex-col rounded-md border border-cad-picked/60 px-2 py-1 text-tiny leading-5 text-foreground">
    {items.map(item => <li key={item.key} className="flex min-w-0 items-center gap-1.5">
      <span className="size-2 shrink-0 rounded-full bg-cad-picked" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {onClear ? <button type="button" aria-label={`${clearLabel} ${item.label}`} className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent/70 hover:text-foreground"
        onClick={onClear}><X className="size-3" aria-hidden="true" /></button> : null}
    </li>)}
    {more > 0 ? <li className="pl-3.5 text-muted-foreground">{`and ${more} more`}</li> : null}
  </ul>;
}

/** What the command acts on: the faces and edges selected on the model, listed, or how to select them. */
function SelectionList({ items, prompt }) {
  const shown = items.slice(0, LISTED);
  return <SelectionBox items={shown.map(item => ({ key: item.selector, label: selectionLabel(item) }))} prompt={prompt}
    more={items.length - shown.length} />;
}

/** What a reopened feature acts on, kept as it is: "4 edges", with how to pick others. */
function KeptList({ text, hint }) {
  return <>
    <SelectionBox items={[{ key: "kept", label: text }]} prompt="" />
    <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>{hint}</p>
  </>;
}

/**
 * A modeling command's panel, as SolidWorks' PropertyManager, in a card of its own over the model
 * (`EditBrowser.jsx`): OK and Cancel in its title row, a green check and a red cross; what it acts
 * on in selection boxes (the faces or edges selected on the model, the
 * sketch an extrude takes, picked on the model or in the design tree, or the history feature it
 * copies); and its inputs in the part's units. OK writes the command's line into the part's script
 * (`cadgen/edit`) and the new feature is selected in the history below; Cancel, or Escape, leaves
 * the script as it was. While it is open an extrude is previewed on the model (`edit.preview`).
 * Reopened by Edit Feature (`edit.editing`), it opens with the feature's values and keeps what the
 * feature acts on (a fillet's edges, a hole's face), unless others are picked on the body as it was
 * before it, which the view shows while the panel is open; its OK writes the feature's line again.
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>,
 *   names: ReturnType<typeof import("./editMode.js").featureNames>, references: object[] }} props
 */
export default function EditCommand({ edit, names, references, tree = null }) {
  const command = editCommand(edit.command);
  const units = edit.state?.units || "mm";
  const editing = edit.editing?.command === edit.command ? edit.editing : null;
  const opened = useMemo(() => (editing ? editingValues(editing, units) : commandDefaults(edit.command, units)), [editing, edit.command, units]);
  const [values, setValues] = useState(opened);
  useEffect(() => { setValues(opened); }, [opened]);
  // The sketch an extrude makes a solid of: the one selected in the design tree, or the feature's
  // own when it is reopened. One on a face of the part cuts into it, as SolidWorks' Extruded Cut does.
  const sketch = command?.sketch ? (editing ? editing.sketch : treeSketch(tree, edit.selected)) : null;
  // A cut goes into the part: reversed when the part lies behind the sketch's plane (a sketch on a
  // face of it, or on a plane over it), as a cut from a face goes in.
  const side = sketch ? partSide(sketchView(edit.state, sketch), edit.state?.bounds) : 0;
  const onFace = sketch ? (sketchView(edit.state, sketch)?.plane || sketch.plane) === "Plane" : false;
  const intoPart = side !== 0 ? side < 0 : onFace;
  useEffect(() => { if (edit.command === "cut" && !editing) setValues(current => ({ ...current, reverse: intoPart })); }, [edit.command, intoPart, editing]);
  // A revolve turns about a line of its sketch: its centerline, as it opens, when it has one.
  const revolving = edit.command === "revolve" || edit.command === "revolve_cut";
  const axes = useMemo(() => (revolving && sketch ? revolveAxes(sketchView(edit.state, sketch)) : []), [revolving, sketch, edit.state]);
  const firstAxis = axes[0]?.value || "";
  useEffect(() => {
    if (revolving) setValues(current => (axes.some(axis => axis.value === current.axis) ? current : { ...current, axis: firstAxis }));
  }, [revolving, axes, firstAxis]);
  const items = useMemo(() => selectionItems(references), [references]);
  const rows = edit.state?.rows || [];
  const featureIndex = rows.findIndex(row => row.key === edit.selected);
  // A feature picked in the history is what Mirror and Pattern copy; the first one is the body.
  const [wholeBody, setWholeBody] = useState(featureIndex <= 0);
  useEffect(() => { setWholeBody(featureIndex <= 0); }, [featureIndex, edit.command]);
  // A straight edge picked while Pattern is open sets its direction, as SolidWorks' Direction 1 takes an edge.
  const pickedAxis = edit.command === "pattern" ? edgeAxis(references) : null;
  useEffect(() => { if (pickedAxis) setValues(current => ({ ...current, type: "linear", direction: pickedAxis })); }, [pickedAxis]);
  // A click on the hole's face puts the hole there: its distance from the face's center.
  const { facePoint } = edit;
  useEffect(() => {
    if (edit.command !== "hole" || !facePoint) return;
    const moved = clickOffsets(facePoint.point, facePoint.center, facePoint.normal, units);
    if (moved) setValues(current => ({ ...current, ...moved }));
  }, [facePoint, edit.command, units]);
  // What OK would make, drawn on the model while the panel is open: the extrude of its sketch, its
  // depth in the part's millimetres, or its revolve about the axis line by the angle. A depth or an
  // angle written as a size's name is not drawn; Up To Next ends where the body says.
  const { setPreview } = edit;
  const depth = Number.parseFloat(String(values.depth ?? ""));
  const extruding = (edit.command === "extrude" || edit.command === "cut") && Boolean(sketch) && values.end !== "next";
  const previewDepth = extruding && Number.isFinite(depth) ? depth * (MM_PER[units] || 1) : null;
  const angle = Number.parseFloat(String(values.angle ?? ""));
  const axisLine = revolving && sketch
    ? sketchGeometry(sketchView(edit.state, sketch)?.state).curves.find(curve => curve.id === values.axis && curve.kind === "line") : null;
  const turn = axisLine && Number.isFinite(angle) && angle > 0 ? (values.reverse ? -angle : angle) : null;
  const kind = edit.command === "cut" || edit.command === "revolve_cut" ? "cut" : "boss";
  useEffect(() => {
    if (turn !== null) {
      setPreview({ kind, revolve: { a: axisLine.a, b: axisLine.b, angle: turn }, file: sketch.file, line: sketch.line });
      return () => setPreview(null);
    }
    if (!extruding || (previewDepth === null && values.end !== "through")) { setPreview(null); return undefined; }
    setPreview({ kind, end: values.end, depth: previewDepth || 0, reverse: Boolean(values.reverse), file: sketch.file, line: sketch.line });
    return () => setPreview(null);
  }, [extruding, previewDepth, values.end, values.reverse, kind, turn, axisLine?.a?.join(), axisLine?.b?.join(), sketch?.file, sketch?.line,
    setPreview]);
  if (!command) return null;
  const Icon = COMMAND_ICONS[command.id];
  const set = key => value => setValues(current => ({ ...current, [key]: value }));
  const disabled = edit.saving || edit.status !== "ready";
  const faces = items.filter(item => /f\d+$/.test(item.selector));
  const listed = command.picks === "edges" ? items : faces;
  const blocked = commandBlocked(command.id, items, sketch, values, editing);
  const feature = !editing && !wholeBody && featureIndex > 0 ? { row: rows[featureIndex].key, name: names[featureIndex]?.title || "" } : null;
  // Edges or faces picked while a feature is reopened replace its own.
  const repicked = Boolean(editing) && REPICKS.has(command.id) && listed.length > 0;
  const ok = () => {
    if (blocked || disabled) return;
    // A reopened feature left as it was: nothing to write.
    if (editing && !repicked && sameValues(values, opened)) { edit.close(); return; }
    void edit.run(commandRequest(command.id, values, items, feature, sketch, editing));
  };
  const copies = command.id === "mirror" || command.id === "pattern";
  const pickedFace = references.find(reference => reference?.selectorType === "face")?.pickData?.normal;
  const offsets = command.id !== "hole" ? [] : editing && !repicked ? editing.axes || [] : faceOffsetAxes(pickedFace);
  const title = editing ? editing.title : command.label;
  // What a reopened feature acts on stays as it is until others are picked, on the body before it.
  const keptHint = command.id === "hole" ? "Select a flat face on the model to move it there."
    : `Select ${command.picks === "edges" ? "edges" : "faces"} on the model to pick others.`;

  const confirm = { onOk: ok, onCancel: edit.close, okDisabled: Boolean(blocked) || disabled, okReason: blocked || "", busy: edit.saving };
  const sketchLabel = sketch ? (sketch.plane && sketch.plane !== "Plane" ? `${sketch.title}, ${sketch.plane} Plane` : sketch.title) : "";

  return <div role="dialog" aria-label={title} data-cad-edit-command={command.id} className="flex shrink-0 flex-col"
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); edit.close(); } }}>
    <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <h2 className="min-w-0 flex-1 truncate text-xs font-normal leading-4 text-foreground">{title}</h2>
      <ConfirmButtons {...confirm} />
    </div>
    {command.picks && !(editing && command.id === "mirror") ? <FileSheetSettingsSection
      title={command.picks === "edges" ? "Edges" : command.id === "mirror" ? "Mirror face" : "Faces"} sectionId="edit-command-selection">
      {editing && !repicked ? <KeptList text={editing.keeps} hint={keptHint} /> : <SelectionList items={listed} prompt={command.prompt} />}
    </FileSheetSettingsSection> : null}
    {command.sketch ? <FileSheetSettingsSection title="Sketch" sectionId="edit-command-sketch">
      {/* The sketch it takes, picked on the model or in the design tree and shaded there; a
          reopened feature keeps its own. */}
      <SelectionBox items={sketch ? [{ key: `${sketch.file}:${sketch.line}`, label: sketchLabel }] : []}
        prompt="Select a sketch on the model or in the design tree." clearLabel="Deselect"
        onClear={editing ? null : () => edit.select(null)} />
    </FileSheetSettingsSection> : null}
    {copies ? <FileSheetSettingsSection title={command.id === "mirror" ? "Mirror" : "Copies"} sectionId="edit-command-copies">
      {editing ? <FileSheetControlRow label="Of" value={sizeName(editing.keeps)} /> : <>
        <FileSheetSelectRow label="Of" value={feature ? "feature" : "body"} onValueChange={value => setWholeBody(value === "body")}
          options={[...(featureIndex > 0 ? [{ value: "feature", label: names[featureIndex]?.title || "Feature" }] : []), { value: "body", label: "Whole body" }]} />
        <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>Pick a feature in the history to copy it.</p>
      </>}
    </FileSheetSettingsSection> : null}
    {revolving ? <FileSheetSettingsSection title="Axis of Revolution" sectionId="edit-command-axis">
      {axes.length ? <FileSheetSelectRow label="About" value={values.axis} options={axes} onValueChange={set("axis")} />
        : <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>{sketch ? "Draw a centerline in the sketch to revolve about." : command.prompt}</p>}
    </FileSheetSettingsSection> : null}
    <FileSheetSettingsSection title={command.sketch ? "Direction 1" : "Parameters"} sectionId="edit-command-parameters">
      {revolving ? <>
        <NumberRow label="Angle" value={values.angle} unit="deg" disabled={disabled} onChange={set("angle")} />
        <FileSheetCheckboxRow label="Reverse direction" checked={values.reverse} disabled={disabled} onCheckedChange={set("reverse")} />
      </> : command.sketch ? <>
        <FileSheetSelectRow label="End condition" value={values.end} options={command.id === "cut" ? CUT_ENDS : BOSS_ENDS} onValueChange={set("end")} />
        {values.end === "through" || values.end === "next" ? null
          : <NumberRow label="Depth" value={values.depth} unit={units} disabled={disabled} onChange={set("depth")} />}
        {values.end === "mid" || values.end === "next" ? null
          : <FileSheetCheckboxRow label="Reverse direction" checked={values.reverse} disabled={disabled} onCheckedChange={set("reverse")} />}
        {/* Draft, as SolidWorks' Draft On/Off: the sides lean in by the angle, or out. */}
        {values.end === "next" ? null : <>
          <FileSheetCheckboxRow label="Draft" checked={values.draft} disabled={disabled} onCheckedChange={set("draft")} />
          {values.draft ? <>
            <NumberRow label="Draft angle" value={values.draft_angle} unit="deg" disabled={disabled} onChange={set("draft_angle")} />
            <FileSheetCheckboxRow label="Draft outward" checked={values.outward} disabled={disabled} onCheckedChange={set("outward")} />
          </> : null}
        </>}
      </> : null}
      {command.id === "fillet" ? <NumberRow label="Radius" value={values.radius} unit={units} disabled={disabled} onChange={set("radius")} /> : null}
      {command.id === "chamfer" ? <NumberRow label="Distance" value={values.distance} unit={units} disabled={disabled} onChange={set("distance")} /> : null}
      {command.id === "shell" ? <NumberRow label="Thickness" value={values.thickness} unit={units} disabled={disabled} onChange={set("thickness")} /> : null}
      {command.id === "hole" ? <>
        <FileSheetSelectRow label="Hole type" value={values.type || "simple"} options={HOLE_TYPES} onValueChange={set("type")} />
        <NumberRow label="Diameter" value={values.diameter} unit={units} disabled={disabled} onChange={set("diameter")} />
        <FileSheetCheckboxRow label="Through all" checked={values.through} disabled={disabled} onCheckedChange={set("through")} />
        {values.through ? null : <NumberRow label="Depth" value={values.depth} unit={units} disabled={disabled} onChange={set("depth")} />}
        {values.type === "counterbore" ? <>
          <NumberRow label="Counterbore diameter" value={values.cbore_diameter} unit={units} disabled={disabled} onChange={set("cbore_diameter")} />
          <NumberRow label="Counterbore depth" value={values.cbore_depth} unit={units} disabled={disabled} onChange={set("cbore_depth")} />
        </> : null}
        {values.type === "countersink" ? <>
          <NumberRow label="Countersink diameter" value={values.csk_diameter} unit={units} disabled={disabled} onChange={set("csk_diameter")} />
          <NumberRow label="Countersink angle" value={values.csk_angle} unit="deg" disabled={disabled} onChange={set("csk_angle")} />
        </> : null}
        {offsets.map(axis => <NumberRow key={axis} label={`${axis.toUpperCase()} from center`} value={values[axis]} unit={units}
          disabled={disabled} onChange={set(axis)} />)}
      </> : null}
      {command.id === "mirror" ? faces.length && !editing ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>About the selected face.</p>
        : <FileSheetSelectRow label="About" value={values.plane} options={editing?.values?.plane === "face" ? [...PLANES, SAME_FACE] : PLANES}
          onValueChange={set("plane")} /> : null}
      {command.id === "pattern" ? <>
        <FileSheetSelectRow label="Type" value={values.type} options={PATTERNS} onValueChange={set("type")} />
        {values.type === "linear" ? <>
          <FileSheetSelectRow label="Direction" value={values.direction} options={DIRECTIONS} onValueChange={set("direction")} />
          <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>Or pick a straight edge along X or Y on the model.</p>
          <NumberRow label="Spacing" value={values.spacing} unit={units} disabled={disabled} onChange={set("spacing")} />
          <FileSheetCheckboxRow label="Reverse direction" checked={values.reverse} disabled={disabled} onCheckedChange={set("reverse")} />
        </> : <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>Around the Z axis, spaced evenly.</p>}
        <NumberRow label="Instances" value={values.count} disabled={disabled} onChange={set("count")} />
      </> : null}
    </FileSheetSettingsSection>
    {/* Why OK waits, where the list does not already say: two faces for one hole. */}
    {blocked && (listed.length || !command.picks) && !(command.sketch && !sketch) ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>{blocked}</p> : null}
    {edit.saving ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`} aria-live="polite">Applying</p> : null}
  </div>;
}
