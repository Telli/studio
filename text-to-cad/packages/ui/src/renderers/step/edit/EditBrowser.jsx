import { useState } from "react";
import {
  Box, Circle, CircleDot, Combine, FlipHorizontal2, Grid3x3, Move3d, Octagon, PackageOpen, Rotate3d, Scissors, Shapes, Square,
  SquareRoundCorner, X
} from "lucide-react";
import { ScrollArea } from "@text-to-cad/ui/primitives/scroll-area";
import { TREE_GLYPH_CLASS, TREE_GLYPH_STROKE, TreeRowSurface } from "@text-to-cad/ui/primitives/tree-row";
import {
  FILE_SHEET_STATUS_TEXT_CLASSES,
  FileSheetControlRow,
  FileSheetSettingsSection,
  FileSheetValueInput
} from "../../kit/inspector/FileSheet.js";
import { TOOL_PANEL_BUTTON_CLASS } from "../../kit/tools/ToolPanel.jsx";
import EditCommand from "./EditCommand.jsx";
import { formulaWords, restates, sizeName } from "./editMode.js";

const KIND_ICONS = Object.freeze({
  Extrude: Box, Box, Cylinder: Box, Sphere: Box, Revolve: Rotate3d, Fillet: SquareRoundCorner, Chamfer: Octagon,
  Cut: Scissors, Combine: Combine, Intersect: Combine, Move: Move3d, Mirror: FlipHorizontal2, Pattern: Grid3x3,
  Hole: CircleDot, Shell: PackageOpen, Rectangle: Square, RectangleRounded: Square, Circle: Circle,
});
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
 * Edit mode's browser, docked at the viewer's left as a CAD tool's design tree: the part's named
 * sizes (Parameters), its history (each operation of its script, numbered as a CAD tree numbers
 * it), and under them the feature selected, with its inputs. Every value is typed over to change
 * it; a change is one number in the part's script (`cadgen/edit`). While a modeling command is
 * open, its panel takes the sizes' place above the history, where a feature to copy is picked.
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, names: ReturnType<typeof import("./editMode.js").featureNames>,
 *   references?: object[] }} props  `references`: the faces and edges selected on the model.
 */
export default function EditBrowser({ edit, names, references = [] }) {
  const [open, setOpen] = useState({ parameters: true, history: true, feature: true });
  const toggle = id => value => setOpen(current => ({ ...current, [id]: value }));
  const { state, status } = edit;
  const params = state?.params || [];
  const rows = state?.rows || [];
  const selectedIndex = rows.findIndex(row => row.key === edit.selected);
  const selectedRow = selectedIndex >= 0 ? rows[selectedIndex] : null;
  const selectedName = selectedIndex >= 0 ? names[selectedIndex] : null;
  const disabled = edit.saving || status !== "ready";
  return <div className="flex h-full min-h-0 flex-col" data-cad-edit-browser="">
    {edit.error ? <div className="flex items-start gap-1 border-b border-border px-2 py-1.5 text-tiny text-destructive" role="alert">
      <span className="min-w-0 flex-1">{edit.error}</span>
      <button type="button" aria-label="Dismiss" className={TOOL_PANEL_BUTTON_CLASS} onClick={edit.dismissError}><X className="size-3" aria-hidden="true" /></button>
    </div> : null}
    {edit.command ? <EditCommand key={edit.command} edit={edit} names={names} references={references} /> : null}
    <ScrollArea className="min-h-0 flex-1">
      {edit.command ? null : <FileSheetSettingsSection title="Parameters" sectionId="edit-parameters" open={open.parameters} onOpenChange={toggle("parameters")}>
        {status === "reading" ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>Reading the part</p>
          : params.length === 0 ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>No named sizes. Ask the agent to name the sizes that matter at the top of the script.</p>
            : params.map(param => <FileSheetControlRow key={param.id} label={sizeName(param.name)}
              trailing={<ValueField value={param.text} unit={param.unit} label={sizeName(param.name)} disabled={disabled}
                onCommit={text => edit.change({ literal: param.id, text })} />} />)}
      </FileSheetSettingsSection>}
      <FileSheetSettingsSection title="History" sectionId="edit-history" open={open.history} onOpenChange={toggle("history")}>
        <div role="listbox" aria-label="History" className="flex flex-col px-1 pb-1">
          {rows.map((row, index) => {
            const name = names[index];
            const Icon = KIND_ICONS[name?.kind] || KIND_ICONS[row.kind] || Shapes;
            const active = row.key === edit.selected;
            return <TreeRowSurface key={row.key} as="button" type="button" dense active={active} role="option" aria-selected={active}
              className="pl-2" onClick={() => edit.select(row.key)} data-cad-edit-feature={row.key}>
              <Icon className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />
              <span className="truncate">{name?.title}</span>
              <span className="ml-auto truncate text-muted-foreground">{name?.name}{row.count > 1 ? ` ×${row.count}` : ""}</span>
            </TreeRowSurface>;
          })}
        </div>
      </FileSheetSettingsSection>
      {selectedRow && !edit.command ? <FileSheetSettingsSection title={selectedName?.name ? `${selectedName.title}, ${selectedName.name}` : selectedName?.title}
        sectionId="edit-feature" open={open.feature} onOpenChange={toggle("feature")}>
        {selectedRow.inputs.length === 0 ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2`}>Nothing to set here.</p>
          : selectedRow.inputs.map((input, index) => <FileSheetControlRow key={`${input.label}:${index}`} label={input.label}
            trailing={<ValueField value={input.display} unit={input.unit} label={input.label} disabled={disabled}
              onCommit={text => edit.change({ input: { row: selectedRow.key, index }, text })} />}>
            {restates(input.formula, input.display) ? null : <span className="block truncate text-micro text-muted-foreground">{`= ${formulaWords(input.formula)}`}</span>}
          </FileSheetControlRow>)}
        {selectedRow.file ? <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-2 pt-1`}>{`${selectedRow.file.split("/").pop()}, line ${selectedRow.line}`}</p> : null}
      </FileSheetSettingsSection> : null}
    </ScrollArea>
  </div>;
}
