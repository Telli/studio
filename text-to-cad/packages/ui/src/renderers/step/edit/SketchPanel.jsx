import { X } from "lucide-react";
import { TREE_GLYPH_STROKE } from "@text-to-cad/ui/primitives/tree-row";
import { cn } from "@text-to-cad/ui/utils";
import {
  FILE_SHEET_STATUS_TEXT_CLASSES,
  FileSheetCheckboxRow,
  FileSheetControlRow,
  FileSheetSettingsSection,
  FileSheetValueInput
} from "../../kit/inspector/FileSheet.js";
import { TOOL_PANEL_BUTTON_CLASS } from "../../kit/tools/ToolPanel.jsx";
import { ORIGIN_PLANES } from "./editMode.js";
import { SketchIcon } from "./featureIcons.jsx";
import { formatValue, relationsFor, relationsOn, sketchTool } from "./sketchMode.js";

const STATUS_CLASSES = Object.freeze({ "Fully defined": "text-foreground", "Under defined": "text-blue-600 dark:text-blue-400",
  "Over defined": "text-red-600 dark:text-red-400" });
const FOOTER_BUTTON_CLASS = "flex h-7 flex-1 items-center justify-center text-tiny focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 disabled:opacity-50";
const CHIP_CLASS = "rounded-md border border-border px-2 py-0.5 text-tiny text-foreground hover:bg-accent/70 disabled:opacity-50";

function Header({ title, detail }) {
  return <div className="flex h-8 items-center gap-1.5 px-2">
    <span className="flex shrink-0 text-muted-foreground"><SketchIcon /></span>
    <h2 className="min-w-0 flex-1 truncate text-xs font-normal leading-4 text-foreground">{title}</h2>
    {detail ? <span className="shrink-0 truncate text-tiny text-muted-foreground">{detail}</span> : null}
  </div>;
}

/** The Sketch command waiting for its plane, as SolidWorks asks for one: the origin's three, or a flat face. */
function PlanePicker({ edit, onPlane }) {
  return <div role="dialog" aria-label="Sketch" className="flex shrink-0 flex-col border-b border-border" data-cad-sketch-picker=""
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); edit.stopPicking(); } }}>
    <Header title="Sketch" />
    <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>Select a plane to sketch on: one of these, a plane in the design tree, or a flat face of the model.</p>
    <div className="flex flex-col gap-1 px-2 pb-2">
      {ORIGIN_PLANES.map(plane => <button key={plane} type="button" className={cn(CHIP_CLASS, "text-left")} disabled={edit.saving}
        onClick={() => onPlane(plane)}>{`${plane} Plane`}</button>)}
    </div>
    <div className="flex border-t border-border">
      <button type="button" className={`${FOOTER_BUTTON_CLASS} text-muted-foreground hover:bg-accent/70 hover:text-foreground`} onClick={edit.stopPicking}>Cancel</button>
    </div>
  </div>;
}

/**
 * Sketch mode's PropertyManager, docked at the viewer's left above the design tree, as SolidWorks
 * shows one while a sketch is edited: the sketch and how defined it is; the tool in hand, what it
 * asks for next and whether it draws construction geometry; and for what is selected, the
 * relations it can take (Add Relations), the ones it has (Existing Relations, each deleted with its
 * X), a dimension's value, and For construction. Exit Sketch at its foot builds the part again.
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, onPlane(plane: string): void }} props
 */
export default function SketchPanel({ edit, onPlane }) {
  if (!edit.sketch) return edit.picking ? <PlanePicker edit={edit} onPlane={onPlane} /> : null;
  const { sketch } = edit;
  const state = sketch.state;
  const units = edit.state?.units || "";
  const disabled = edit.saving;
  const tool = sketchTool(edit.sketchTool);
  const selection = edit.sketchSelection;
  const curves = new Map((state?.curves || []).map(curve => [curve.id, curve]));
  const dimension = selection.length === 1 ? (state?.dimensions || []).find(each => each.id === selection[0]) : null;
  const selectedCurves = selection.filter(id => curves.has(id));
  const allConstruction = selectedCurves.length > 0 && selectedCurves.every(id => curves.get(id).construction);
  const relations = state && selection.length ? relationsFor(state, selection) : [];
  const existing = state && selection.length && !dimension ? relationsOn(state, selection) : [];
  const status = state?.status || "";
  const statusText = !state ? "Not solved" : status === "Under defined"
    ? `Under defined, ${state.dof} ${state.dof === 1 ? "way" : "ways"} it can still move` : status;
  return <div role="dialog" aria-label={sketch.name} className="flex shrink-0 flex-col border-b border-border" data-cad-sketch-panel=""
    onKeyDown={event => { if (event.key === "Escape" && edit.sketchTool) { event.stopPropagation(); edit.setSketchTool(null); } }}>
    <Header title={`Editing ${sketch.name}`} detail={sketch.plane && sketch.plane !== "Plane" ? `${sketch.plane} Plane` : ""} />
    <p className={cn(FILE_SHEET_STATUS_TEXT_CLASSES, "pb-1.5", STATUS_CLASSES[status])} aria-live="polite">{statusText}</p>
    {sketch.error && !state ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2 text-destructive`}>{sketch.error}</p> : null}
    {tool ? <FileSheetSettingsSection title={tool.label} sectionId="sketch-tool">
      <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`} aria-live="polite">{tool.prompts[Math.min(edit.sketchStep, tool.prompts.length - 1)]}</p>
      {tool.id !== "dimension" && tool.id !== "centerline" ? <FileSheetCheckboxRow label="For construction" checked={edit.construction}
        onCheckedChange={value => edit.setConstruction(Boolean(value))} /> : null}
    </FileSheetSettingsSection> : null}
    {!tool && !selection.length && state ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>
      Pick a tool in the ribbon to draw, or select the sketch's lines and points to relate or dimension them. Drag what is blue to move it.
    </p> : null}
    {dimension ? <FileSheetSettingsSection title={dimension.id} sectionId="sketch-dimension">
      <FileSheetControlRow label={dimension.named ? dimension.formula : "Value"} trailing={<span className="flex shrink-0 items-center gap-1">
        <FileSheetValueInput value={formatValue(dimension.value, units, "plain")} ariaLabel={`${dimension.id} value`} disabled={disabled}
          onValueCommit={draft => { const text = String(draft).trim(); if (text) void edit.sketchOp({ kind: "value", dimension: dimension.id, text }); }} />
        <span className="w-6 text-micro text-muted-foreground">{dimension.kind === "angle" ? "deg" : units}</span>
      </span>} />
      <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>Type a number, or a size of the part by its name.</p>
    </FileSheetSettingsSection> : null}
    {selection.length && !dimension ? <FileSheetSettingsSection title="Selected Entities" sectionId="sketch-selection">
      <ul aria-label="Selected" className="mx-2 mb-1 flex flex-col rounded-md border border-border px-2 py-1 text-tiny leading-5 text-foreground">
        {selection.map(id => <li key={id} className="truncate">{id}</li>)}
      </ul>
      {relations.length ? <>
        <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>Add Relations</p>
        <div className="flex flex-wrap gap-1 px-2 pb-1.5">
          {relations.map(({ relation, label }) => <button key={relation} type="button" className={CHIP_CLASS} disabled={disabled}
            onClick={() => void edit.sketchOp({ kind: "relate", relation, refs: selection })}>{label}</button>)}
        </div>
      </> : null}
      {existing.length ? <>
        <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`}>Existing Relations</p>
        <ul className="mx-2 mb-1.5 flex flex-col">
          {existing.map(item => <li key={item.id} className="flex min-h-6 items-center gap-1 text-tiny text-foreground">
            <span className={cn("min-w-0 flex-1 truncate", item.redundant && "text-destructive")}>
              {item.value !== undefined ? `${item.id}, ${formatValue(item.value, units, item.kind)}` : item.id}
            </span>
            <button type="button" aria-label={`Delete ${item.id}`} className={TOOL_PANEL_BUTTON_CLASS} disabled={disabled}
              onClick={() => void edit.sketchOp({ kind: "delete", items: [item.id] })}>
              <X className="size-3" strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />
            </button>
          </li>)}
        </ul>
      </> : null}
      {selectedCurves.length ? <FileSheetCheckboxRow label="For construction" checked={allConstruction} disabled={disabled}
        onCheckedChange={value => void edit.sketchOp({ kind: "construction", items: selectedCurves, on: Boolean(value) })} /> : null}
    </FileSheetSettingsSection> : null}
    <div className="flex border-t border-border">
      <button type="button" className={`${FOOTER_BUTTON_CLASS} text-muted-foreground hover:bg-accent/70 hover:text-foreground`} disabled={disabled}
        onClick={() => void edit.cancelSketch()}>Discard Changes</button>
      <button type="button" className={`${FOOTER_BUTTON_CLASS} border-l border-border text-foreground hover:bg-accent/70`} disabled={disabled}
        onClick={() => void edit.exitSketch()}>{edit.saving ? "Solving" : "Exit Sketch"}</button>
    </div>
  </div>;
}
