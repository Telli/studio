import { useState } from "react";
import {
  FILE_SHEET_STATUS_TEXT_CLASSES,
  FileSheetCheckboxRow,
  FileSheetControlRow,
  FileSheetSelectRow,
  FileSheetSettingsSection,
  FileSheetValueInput
} from "../../kit/inspector/FileSheet.js";
import { MateIcon } from "./cadIcons.jsx";
import { ConfirmButtons } from "./ConfirmButtons.jsx";
import { SelectionBox } from "./EditCommand.jsx";
import { selectionItems, selectionLabel } from "./editMode.js";

// SolidWorks' Standard Mates this places a part by.
const MATE_TYPES = Object.freeze([{ value: "coincident", label: "Coincident" }, { value: "concentric", label: "Concentric" },
  { value: "distance", label: "Distance" }, { value: "parallel", label: "Parallel" }, { value: "perpendicular", label: "Perpendicular" },
  { value: "angle", label: "Angle" }]);
// The mates that line their picks up one way or the other, which Flip alignment turns.
const FLIPS = new Set(["coincident", "concentric", "distance", "parallel"]);

/** Which of the assembly's parts a pick is on, by its occurrence (`o1.2.f3`: the second part). */
const partOf = (item, components) => {
  const match = /^o\d+\.(\d+)\./.exec(String(item?.selector || ""));
  return match ? components[Number(match[1]) - 1]?.title || "" : "";
};

/**
 * Mate, as SolidWorks' Mate places an assembly's parts: a face, an edge or a vertex picked on the
 * part that stays, then one on the part that moves to it; Coincident puts two flat faces face to
 * face, Distance a gap apart, Concentric two round faces or circular edges on one axis (two circular
 * edges centre on centre), Parallel, Perpendicular and Angle line them up. OK adds it to the moved
 * part's mates in the assembly (`edit.mate`), solved together with its others; what they leave free
 * stays where the part was.
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, references: any[], components: any[],
 *   onDeselect?: (id: string) => void }} props
 */
export default function MatePanel({ edit, references, components = [], onDeselect }) {
  const [type, setType] = useState("coincident");
  const [distance, setDistance] = useState("10");
  const [angle, setAngle] = useState("90");
  const [flip, setFlip] = useState(false);
  const picked = references.filter(reference => reference?.selectorType === "face" || reference?.selectorType === "edge");
  const items = selectionItems(picked);
  const blocked = items.length < 1 ? "Pick a face or an edge on the part that stays."
    : items.length < 2 ? "Pick a face or an edge on the part that moves to it."
      : items.length > 2 ? "A mate takes two picks: take one out." : "";
  const listed = items.map((item, index) => {
    const part = partOf(item, components);
    return { key: picked[index]?.id || item.selector, label: `${selectionLabel(item)}${part ? ` of ${part}` : ""}${index === 1 ? ", moves" : ""}` };
  });
  const ok = async () => {
    const reply = await edit.mate({ type, selection: items, ...(type === "distance" ? { distance } : {}), ...(type === "angle" ? { angle } : {}),
      ...(flip && FLIPS.has(type) ? { flip: true } : {}) });
    if (reply?.ok) edit.stopInspecting();
  };
  return <div role="dialog" aria-label="Assembly Constraints" data-cad-mate="" className="flex shrink-0 flex-col"
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); edit.stopInspecting(); } }}>
    <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
      <MateIcon className="size-5 shrink-0" />
      <h2 className="min-w-0 flex-1 truncate text-xs font-normal leading-4 text-foreground">Assembly Constraints</h2>
    </div>
    <FileSheetSettingsSection title="Mate Selections" sectionId="mate-selections">
      <SelectionBox items={listed} prompt={blocked} onClear={onDeselect ? item => onDeselect(item.key) : null} clearLabel="Remove" />
      {items.length === 2 ? null : <p className={`${FILE_SHEET_STATUS_TEXT_CLASSES} pb-1`} aria-live="polite">{blocked}</p>}
    </FileSheetSettingsSection>
    <FileSheetSettingsSection title="Standard Mates" sectionId="mate-type">
      <FileSheetSelectRow label="Mate" value={type} options={MATE_TYPES} onValueChange={setType} />
      {type === "distance" ? <FileSheetControlRow label="Distance" trailing={<span className="flex shrink-0 items-center gap-1">
        <FileSheetValueInput value={distance} ariaLabel="Distance" onValueCommit={draft => setDistance(String(draft).trim())} />
        <span className="w-6 text-micro text-muted-foreground">{edit.state?.units || ""}</span>
      </span>} /> : null}
      {type === "angle" ? <FileSheetControlRow label="Angle" trailing={<span className="flex shrink-0 items-center gap-1">
        <FileSheetValueInput value={angle} ariaLabel="Angle" onValueCommit={draft => setAngle(String(draft).trim())} />
        <span className="w-6 text-micro text-muted-foreground">deg</span>
      </span>} /> : null}
      {FLIPS.has(type) ? <FileSheetCheckboxRow label="Flip alignment" checked={flip} onCheckedChange={value => setFlip(Boolean(value))} /> : null}
    </FileSheetSettingsSection>
    <ConfirmButtons className="border-t border-border px-2 py-2" onOk={() => void ok()} onCancel={edit.stopInspecting} okDisabled={Boolean(blocked) || edit.saving} okReason={blocked} busy={edit.saving} />
  </div>;
}
