import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@text-to-cad/ui/utils";
import { Button } from "@text-to-cad/ui/primitives/button";
import { ScrollArea } from "@text-to-cad/ui/primitives/scroll-area";
import {
  FILE_SHEET_COMPACT_BUTTON_CLASSES,
  FILE_SHEET_STATUS_TEXT_CLASSES,
  FileSheetButtonRow,
  FileSheetControlRow,
  FileSheetSettingsSection,
  FileSheetValueInput
} from "../../kit/inspector/FileSheet.js";
import { FLOATING_SURFACE_CLASS } from "../../../lib/floatingSurface.js";
import { TOOL_PANEL_BUTTON_CLASS } from "../../kit/tools/ToolPanel.jsx";
import EditCommand from "./EditCommand.jsx";
import EditTree from "./EditTree.jsx";
import SketchPanel from "./SketchPanel.jsx";
import MassProperties from "./MassProperties.jsx";
import MatePanel from "./MatePanel.jsx";
import DrawingPanel from "./DrawingPanel.jsx";
import Appearance from "./Appearance.jsx";
import { formulaWords, restates, selectionDimensions, sizeName, treeFeatures } from "./editMode.js";

const UNIT_MARKS = Object.freeze({ mm: "mm", in: "in" });

/** A number of the part, as its row shows it: its value in the source, typed over to change it, and its unit. */
function ValueField({ value, unit, label, disabled, onCommit }) {
  return <span className="flex shrink-0 items-center gap-1">
    <FileSheetValueInput value={value} ariaLabel={`${label} value`} disabled={disabled}
      onValueCommit={draft => { const text = String(draft).trim(); if (text && text !== String(value)) onCommit(text); }} />
    <span className="w-4 text-micro text-muted-foreground">{UNIT_MARKS[unit] || unit || ""}</span>
  </span>;
}

/**
 * Edit mode's browser, docked at the viewer's left as a CAD tool's left pane: the design tree
 * (`EditTree.jsx`: the part, its Parameters, the origin's planes, its features with their
 * sketches), and under it the selection's own values, as a PropertyManager shows them: a
 * feature's inputs, or a sketch's dimensions. Every value is typed over to change it; a change is
 * one number in the part's script (`cadgen/edit`). While a modeling command is open, its panel
 * floats in a card of its own over the model (`card`), apart from the tree, where a feature to copy
 * is picked; while a sketch is edited, or the Sketch command waits for its plane, the sketch's
 * PropertyManager does (`SketchPanel.jsx`).
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, names: ReturnType<typeof import("./editMode.js").featureNames>,
 *   tree: ReturnType<typeof import("./editMode.js").featureTree>, references?: object[],
 *   onEditSketch?: (sketch: object) => void, onPlane?: (plane: string) => void, onOpenPart?: ((component: object) => void) | null }} props
 *   `references`: the faces and edges selected on the model; `onOpenPart`: a part of an assembly
 *   opened on its own, to be modeled (SolidWorks' Open Part), and `backTo` ({ title, open }) the
 *   assembly a part was opened from; `onEditSketch`: a sketch's
 *   double-click in the tree; `onPlane`: an origin plane picked for a new sketch; `card`: the
 *   place over the model's top-right corner where the open command's panel floats;
 *   `onDeselect`: a face or edge the command's panel lists taken out of the selection (its id).
 */
export default function EditBrowser({ edit, names, tree, references = [], onEditSketch = () => {}, onPlane = () => {}, onOpenPart = null,
  backTo = null, card = null, onDeselect = null }) {
  const [open, setOpen] = useState(true);
  const { state, status } = edit;
  const rows = state?.rows || [];
  const disabled = edit.saving || status !== "ready";
  const selected = edit.selected || "";
  const sketchSelected = selected.startsWith("sketch:");
  const feature = treeFeatures(tree).find(each => each.id === (sketchSelected ? selected.slice("sketch:".length) : selected)) || null;
  // A part of an assembly, selected in the tree: an assembly places its parts, so a part is
  // modeled on its own, opened as SolidWorks' Open Part opens it.
  const component = tree.assembly ? tree.components.find(each => each.id === selected) || null : null;
  const title = !feature ? "" : sketchSelected ? `${feature.sketch?.title || "Sketch"}${feature.sketch?.plane && feature.sketch.plane !== "Plane" ? `, ${feature.sketch.plane} Plane` : ""}`
    : feature.name ? `${feature.title}, ${feature.name}` : feature.title;
  // A feature's inputs, its sketch's dimensions among them (D1@Sketch2), each changed through the
  // feature, so the part is built again with it.
  const featureInputs = feature => feature.rows.flatMap(key => (rows.find(row => row.key === key)?.inputs || []).map((input, index) => ({
    key: `${key}:${index}`, label: input.label, value: input.display, unit: input.unit, formula: input.formula,
    request: text => ({ input: { row: key, index }, text }) })));
  const sketchInputs = feature && sketchSelected && feature.sketch?.constrained
    ? featureInputs(feature).filter(input => input.label.endsWith(`@${feature.sketch.title}`)) : null;
  const inputs = !feature ? [] : sketchInputs || (sketchSelected
    ? selectionDimensions(state, tree, selected).map(dimension => ({ key: dimension.id, label: sizeName(dimension.name), value: dimension.display,
      unit: state?.units, formula: dimension.formula, request: text => ({ dimension: dimension.id, text }) }))
    : featureInputs(feature));
  // The open command's or sketch's panel, in a card of its own over the model's top-right corner, as
  // a CAD tool's command dialog floats apart from its tree; here, above the tree, where the view
  // keeps no card for it.
  const panel = edit.sketch || edit.picking ? <SketchPanel edit={edit} onPlane={onPlane} references={references} />
    : edit.command ? <EditCommand key={`${edit.command}:${edit.editing?.id || ""}`} edit={edit} names={names} references={references} tree={tree}
      onDeselect={onDeselect} />
      // Mass Properties, from the ribbon's Inspect group, in the same card.
      : edit.inspecting === "mass" ? <MassProperties edit={edit} />
        : edit.inspecting === "appearance" ? <Appearance edit={edit} />
          // Mate, from the ribbon's Assemble group: an assembly's part placed by two picks.
          : edit.inspecting === "mate" ? <MatePanel edit={edit} references={references} components={tree?.components || []} onDeselect={onDeselect} />
            // The part's drawing, from the ribbon's Drawing group.
            : edit.inspecting === "drawing" && edit.state?.drawing ? <DrawingPanel edit={edit} />
              : null;
  // The card scrolls in the viewer's one ScrollArea once its panel is taller than the view.
  const floating = panel && card ? createPortal(<ScrollArea data-cad-command-card="" className={cn(FLOATING_SURFACE_CLASS,
    "pointer-events-auto max-h-full rounded-lg")}>{panel}</ScrollArea>, card) : null;
  return <div className="flex h-full min-h-0 flex-col" data-cad-edit-browser="">
    {edit.error ? <div className="flex items-start gap-1 border-b border-border px-2 py-1.5 text-tiny text-destructive" role="alert">
      <span className="min-w-0 flex-1">{edit.error}</span>
      <button type="button" aria-label="Dismiss" className={TOOL_PANEL_BUTTON_CLASS} onClick={edit.dismissError}><X className="size-3" aria-hidden="true" /></button>
    </div> : null}
    {floating || panel}
    <ScrollArea className="min-h-0 flex-1">
      <EditTree edit={edit} tree={tree} onEditSketch={onEditSketch} onOpenPart={onOpenPart} backTo={backTo} />
      {component && !edit.command && !edit.sketch ? <FileSheetSettingsSection title={component.title} sectionId="edit-component">
        <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>
          {component.step && onOpenPart ? "A part of this assembly. Open it to change its features, sketch on it and add new ones."
            : "A part of this assembly. Ask the agent to change it."}</p>
        {component.step && onOpenPart ? <div className="pb-2"><FileSheetButtonRow>
          <Button type="button" variant="outline" size="sm" className={cn(FILE_SHEET_COMPACT_BUTTON_CLASSES, "justify-center")}
            onClick={() => onOpenPart(component)}>Open Part</Button>
        </FileSheetButtonRow></div> : null}
      </FileSheetSettingsSection> : null}
      {feature && !edit.command && !edit.sketch ? <FileSheetSettingsSection title={title} sectionId="edit-feature" open={open} onOpenChange={setOpen}>
        {feature.kind === "Sketch" ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>
          Double-click it to edit the sketch, or make a solid of it with an extrude or a revolve.</p>
          : feature.suppressed ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>
            Suppressed: its lines are comments in the script. Right-click it and choose Unsuppress to put it back.</p>
          : inputs.length === 0 ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>Nothing to set here.</p>
          : inputs.map(input => <FileSheetControlRow key={input.key} label={input.label}
            trailing={<ValueField value={input.value} unit={input.unit} label={input.label} disabled={disabled}
              onCommit={text => edit.change(input.request(text))} />}>
            {restates(input.formula, input.value) ? null : <span className="block truncate text-micro text-muted-foreground">{`= ${formulaWords(input.formula)}`}</span>}
          </FileSheetControlRow>)}
        {feature.file ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2 pt-1`}>{`${feature.file.split("/").pop()}, line ${feature.line}`}</p> : null}
      </FileSheetSettingsSection> : null}
    </ScrollArea>
  </div>;
}
