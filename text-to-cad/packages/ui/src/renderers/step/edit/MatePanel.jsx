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
  { value: "distance", label: "Distance" }]);

/** Which of the assembly's parts a pick is on, by its occurrence (`o1.2.f3`: the second part). */
const partOf = (item, components) => {
  const match = /^o\d+\.(\d+)\./.exec(String(item?.selector || ""));
  return match ? components[Number(match[1]) - 1]?.title || "" : "";
};

/**
 * Mate, as SolidWorks' Mate places an assembly's parts: a face or an edge picked on the part that
 * stays, then one on the part that moves to it; Coincident puts two flat faces face to face,
 * Distance a gap apart, Concentric two round faces or circular edges on one axis (two circular
 * edges centre on centre). OK writes it into the assembly as joints (`edit.mate`), and the part
 * keeps what the mate leaves free where it was.
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, references: any[], components: any[],
 *   onDeselect?: (id: string) => void }} props
 */
export default function MatePanel({ edit, references, components = [], onDeselect }) {
  const [type, setType] = useState("coincident");
  const [distance, setDistance] = useState("10");
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
    const reply = await edit.mate({ type, selection: items, ...(type === "distance" ? { distance } : {}), ...(flip ? { flip: true } : {}) });
    if (reply?.ok) edit.stopInspecting();
  };
  return <div role="dialog" aria-label="Mate" data-cad-mate="" className="flex shrink-0 flex-col"
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); edit.stopInspecting(); } }}>
    <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
      <MateIcon className="size-5 shrink-0" />
      <h2 className="min-w-0 flex-1 truncate text-xs font-normal leading-4 text-foreground">Mate</h2>
      <ConfirmButtons onOk={() => void ok()} onCancel={edit.stopInspecting} okDisabled={Boolean(blocked) || edit.saving}
        okReason={blocked} busy={edit.saving} />
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
      <FileSheetCheckboxRow label="Flip alignment" checked={flip} onCheckedChange={value => setFlip(Boolean(value))} />
    </FileSheetSettingsSection>
  </div>;
}
