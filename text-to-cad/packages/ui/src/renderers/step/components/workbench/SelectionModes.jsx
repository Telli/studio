import { PositionIcon } from '../../../kit/tools/ChangedDot.jsx';
import { CONNECTED_SELECTION, SELECT_GEOMETRY, connectedSelectionApplies } from '../../workbench/selectionFilter.js';
import { DropdownMenuCheckboxItem } from '@text-to-cad/ui/primitives/dropdown-menu';
import SelectFilterMenu from "../../../kit/tools/select/SelectFilterMenu.jsx";
import { ModeGlyph, modeGlyphIcon } from "../../../kit/tools/select/modeGlyphs.jsx";

const lucideIcon = Icon => <Icon className="size-3.5" strokeWidth={2} aria-hidden="true" />;

const glyphIcon = modeGlyphIcon;
// The overlays All picks too, beside the model's geometry: the annotations and measurements,
// drawn over the model, so a click on one is never mistaken for the face under it.
const SELECT_OVERLAYS = Object.freeze(['annotation', 'measurement']);
// Each connected-selection option's glyph.
const GROUP_GLYPHS = Object.freeze({ tangentFaces: 'groupFaces', edgeChain: 'groupEdges' });
/** All, what a STEP's Select picks when a file opens: Parts too, which a part file offers no mode of its own. */
export const STEP_SELECT_DEFAULT = Object.freeze([...SELECT_GEOMETRY.map(kind => kind.id), 'position', ...SELECT_OVERLAYS]);

/**
 * A STEP's Select modes: All (the default: a face or an edge where a part's are loaded, the part
 * elsewhere, Position's knobs, the annotations and the measurements), then each alone — Parts (in an
 * assembly), Faces, Edges, and Position (where the file has joints: its knobs, the model picks nothing).
 */
export function stepSelectModes({ assembly, posable }) {
  return [
    { id: 'all', label: 'All', kinds: STEP_SELECT_DEFAULT, icon: <ModeGlyph tool="select" mode="all" className="size-3.5" aria-hidden="true" /> },
    ...SELECT_GEOMETRY.filter(item => assembly || !item.assemblyOnly).map(item => ({ id: item.id, label: item.label, kinds: [item.id], icon: glyphIcon(item.id) })),
    ...(posable ? [{ id: 'position', label: 'Position', kinds: ['position'], icon: lucideIcon(PositionIcon) }] : []),
  ];
}

/**
 * A STEP's Select menu (`kit/tools/select/SelectFilterMenu.jsx`): its modes (`stepSelectModes`), one
 * chosen; then the connected-selection options that do something under it — Group faces while it
 * picks faces, Group edges while it picks edges. An option that does nothing is not shown, and keeps
 * its choice for when it does.
 *
 * @param {{ value: readonly string[], onChange(filter: readonly string[]): void, assembly: boolean, posable: boolean,
 *   connected: { edgeChain: boolean, tangentFaces: boolean },
 *   onConnectedChange(id: "edgeChain" | "tangentFaces", checked: boolean): void, disabled?: boolean }} props
 */
export function SelectModeMenu({ value, onChange, assembly, posable, connected, onConnectedChange, disabled = false }) {
  const options = CONNECTED_SELECTION.filter(option => connectedSelectionApplies(option.id, value));
  return <SelectFilterMenu value={value} onChange={onChange} modes={stepSelectModes({ assembly, posable })} disabled={disabled}>
    {options.length ? options.map(option => <DropdownMenuCheckboxItem key={option.id} checked={connected[option.id] === true}
      onSelect={event => event.preventDefault()} onCheckedChange={checked => onConnectedChange(option.id, checked === true)}>
      {glyphIcon(GROUP_GLYPHS[option.id])}{option.label}
    </DropdownMenuCheckboxItem>) : null}
  </SelectFilterMenu>;
}
