import { useEffect, useMemo, useState } from "react";
import { CircleDot, FlipHorizontal2, Grid3x3, Octagon, PackageOpen, SquareRoundCorner } from "lucide-react";
import { TREE_GLYPH_STROKE } from "@text-to-cad/ui/primitives/tree-row";
import {
  FILE_SHEET_STATUS_TEXT_CLASSES,
  FileSheetCheckboxRow,
  FileSheetControlRow,
  FileSheetSelectRow,
  FileSheetSettingsSection,
  FileSheetValueInput
} from "../../kit/inspector/FileSheet.js";
import {
  commandBlocked,
  commandDefaults,
  commandRequest,
  editCommand,
  editingValues,
  faceOffsetAxes,
  REPICKS,
  revolveAxes,
  sameValues,
  selectionItems,
  selectionLabel,
  sizeName,
  sketchView,
  treeSketch
} from "./editMode.js";
import { ExtrudedBossIcon, ExtrudedCutIcon, RevolvedBossIcon, RevolvedCutIcon } from "./sketchIcons.jsx";

/** Each command's mark, in the ribbon and on its panel. */
export const COMMAND_ICONS = Object.freeze({
  extrude: ExtrudedBossIcon, cut: ExtrudedCutIcon, revolve: RevolvedBossIcon, revolve_cut: RevolvedCutIcon,
  hole: CircleDot, pattern: Grid3x3, mirror: FlipHorizontal2, fillet: SquareRoundCorner, chamfer: Octagon, shell: PackageOpen,
});
// An extrude's end conditions, as SolidWorks' Direction 1 names them; a cut can go through all.
const BOSS_ENDS = Object.freeze([{ value: "blind", label: "Blind" }, { value: "mid", label: "Mid Plane" }]);
const CUT_ENDS = Object.freeze([...BOSS_ENDS, { value: "through", label: "Through All" }]);
const UNIT_MARKS = Object.freeze({ mm: "mm", in: "in" });
const LISTED = 8;
const PLANES = Object.freeze([{ value: "XY", label: "XY plane" }, { value: "XZ", label: "XZ plane" }, { value: "YZ", label: "YZ plane" }]);
const PATTERNS = Object.freeze([{ value: "linear", label: "Linear" }, { value: "circular", label: "Circular" }]);
const DIRECTIONS = Object.freeze([{ value: "X", label: "Along X" }, { value: "Y", label: "Along Y" }]);
// A mirror Edit Feature reopens that was made about a face of the part: that face again.
const SAME_FACE = Object.freeze({ value: "face", label: "Same face" });
const FOOTER_BUTTON_CLASS = "flex h-7 flex-1 items-center justify-center text-tiny focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 disabled:opacity-50";

/** A number the command takes, typed over as the design tree's are, with its unit. */
function NumberRow({ label, value, unit = "", disabled, onChange }) {
  return <FileSheetControlRow label={label} trailing={<span className="flex shrink-0 items-center gap-1">
    <FileSheetValueInput value={value} ariaLabel={label} disabled={disabled} onValueCommit={draft => onChange(String(draft).trim())} />
    <span className="w-4 text-micro text-muted-foreground">{UNIT_MARKS[unit] || unit}</span>
  </span>} />;
}

/** What the command acts on: the faces and edges selected on the model, listed, or how to select them. */
function SelectionList({ items, prompt }) {
  if (!items.length) return <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>{prompt}</p>;
  const shown = items.slice(0, LISTED);
  return <ul aria-label="Selected" className="mx-2 flex flex-col rounded-md border border-border px-2 py-1 text-tiny leading-5 text-foreground">
    {shown.map(item => <li key={item.selector} className="truncate">{selectionLabel(item)}</li>)}
    {items.length > shown.length ? <li className="text-muted-foreground">{`and ${items.length - shown.length} more`}</li> : null}
  </ul>;
}

/** What a reopened feature acts on, kept as it is: "4 edges", with how to pick others. */
function KeptList({ text, hint }) {
  return <>
    <ul aria-label="Selected" className="mx-2 flex flex-col rounded-md border border-border px-2 py-1 text-tiny leading-5 text-foreground">
      <li className="truncate">{text}</li>
    </ul>
    <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>{hint}</p>
  </>;
}

/**
 * A modeling command's panel, docked at the viewer's left as SolidWorks' PropertyManager: what it
 * acts on (the faces or edges selected on the model, or the history feature it copies), its
 * inputs in the part's units, and OK and Cancel at its foot. OK writes the command's line into
 * the part's script (`cadgen/edit`) and the new feature is selected in the history below; Cancel,
 * or Escape, leaves the script as it was. Reopened by Edit Feature (`edit.editing`), it opens with
 * the feature's values and keeps what the feature acts on (a fillet's edges, a hole's face), unless
 * others are picked on the body as it was before it, which the view shows while the panel is open;
 * its OK writes the feature's line again.
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
  const onFace = sketch ? (sketchView(edit.state, sketch)?.plane || sketch.plane) === "Plane" : false;
  useEffect(() => { if (edit.command === "cut" && !editing) setValues(current => ({ ...current, reverse: onFace })); }, [edit.command, onFace, editing]);
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

  return <div role="dialog" aria-label={title} data-cad-edit-command={command.id} className="flex shrink-0 flex-col border-b border-border"
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); edit.close(); } }}>
    <div className="flex h-8 items-center gap-1.5 px-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />
      <h2 className="min-w-0 flex-1 truncate text-xs font-normal leading-4 text-foreground">{title}</h2>
    </div>
    {command.picks && !(editing && command.id === "mirror") ? <FileSheetSettingsSection
      title={command.picks === "edges" ? "Edges" : command.id === "mirror" ? "Mirror face" : "Faces"} sectionId="edit-command-selection">
      {editing && !repicked ? <KeptList text={editing.keeps} hint={keptHint} /> : <SelectionList items={listed} prompt={command.prompt} />}
    </FileSheetSettingsSection> : null}
    {command.sketch ? <FileSheetSettingsSection title="Sketch" sectionId="edit-command-sketch">
      {sketch ? <ul aria-label="Sketch" className="mx-2 mb-1 flex flex-col rounded-md border border-border px-2 py-1 text-tiny leading-5 text-foreground">
        <li className="truncate">{sketch.plane && sketch.plane !== "Plane" ? `${sketch.title}, ${sketch.plane} Plane` : sketch.title}</li>
      </ul> : <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>{command.prompt}</p>}
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
        {values.end === "through" ? null : <NumberRow label="Depth" value={values.depth} unit={units} disabled={disabled} onChange={set("depth")} />}
        {values.end === "mid" ? null : <FileSheetCheckboxRow label="Reverse direction" checked={values.reverse} disabled={disabled} onCheckedChange={set("reverse")} />}
      </> : null}
      {command.id === "fillet" ? <NumberRow label="Radius" value={values.radius} unit={units} disabled={disabled} onChange={set("radius")} /> : null}
      {command.id === "chamfer" ? <NumberRow label="Distance" value={values.distance} unit={units} disabled={disabled} onChange={set("distance")} /> : null}
      {command.id === "shell" ? <NumberRow label="Thickness" value={values.thickness} unit={units} disabled={disabled} onChange={set("thickness")} /> : null}
      {command.id === "hole" ? <>
        <NumberRow label="Diameter" value={values.diameter} unit={units} disabled={disabled} onChange={set("diameter")} />
        <FileSheetCheckboxRow label="Through all" checked={values.through} disabled={disabled} onCheckedChange={set("through")} />
        {values.through ? null : <NumberRow label="Depth" value={values.depth} unit={units} disabled={disabled} onChange={set("depth")} />}
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
          <NumberRow label="Spacing" value={values.spacing} unit={units} disabled={disabled} onChange={set("spacing")} />
          <FileSheetCheckboxRow label="Reverse direction" checked={values.reverse} disabled={disabled} onCheckedChange={set("reverse")} />
        </> : <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>Around the Z axis, spaced evenly.</p>}
        <NumberRow label="Instances" value={values.count} disabled={disabled} onChange={set("count")} />
      </> : null}
    </FileSheetSettingsSection>
    {/* Why OK waits, where the list does not already say: two faces for one hole. */}
    {blocked && (listed.length || !command.picks) && !(command.sketch && !sketch) ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>{blocked}</p> : null}
    <div className="flex border-t border-border">
      <button type="button" className={`${FOOTER_BUTTON_CLASS} text-muted-foreground hover:bg-accent/70 hover:text-foreground`}
        onClick={edit.close}>Cancel</button>
      <button type="button" disabled={Boolean(blocked) || disabled} aria-description={blocked || undefined}
        className={`${FOOTER_BUTTON_CLASS} border-l border-border text-foreground hover:bg-accent/70`} onClick={ok}>
        {edit.saving ? "Applying" : "OK"}
      </button>
    </div>
  </div>;
}
