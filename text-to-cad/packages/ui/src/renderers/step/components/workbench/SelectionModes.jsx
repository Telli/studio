import { CONNECTED_SELECTION, SELECT_GEOMETRY, connectedSelectionApplies } from '../../workbench/selectionFilter.js';
import { DropdownMenuCheckboxItem } from '@text-to-cad/ui/primitives/dropdown-menu';
import SelectFilterMenu from "../../../kit/tools/select/SelectFilterMenu.jsx";
import { MEASURE_MODES } from "../../../kit/tools/measure/MeasureFilterMenu.jsx";
import { SELECT_GROUP_ICON_NAMES, ToolIcon } from "../../edit/cadIcons.jsx";
import { NxIcon } from "../../../../lib/nxIcons.generated.jsx";

// Each mode's row drawn by the icon generator, as the strip's button shows the mode chosen (`ToolIcon`).
const modeIcon = (tool, mode) => <ToolIcon id={tool} mode={mode} className="size-3.5" />;
// The overlays All picks too, beside the model's geometry: the annotations and measurements,
// drawn over the model, so a click on one is never mistaken for the face under it.
const SELECT_OVERLAYS = Object.freeze(['annotation', 'measurement']);
/** All, what a STEP's Select picks when a file opens: Parts too, which a part file offers no mode of its own. */
export const STEP_SELECT_DEFAULT = Object.freeze([...SELECT_GEOMETRY.map(kind => kind.id), 'position', ...SELECT_OVERLAYS]);

/**
 * A STEP's Select modes: All (the default: a face or an edge where a part's are loaded, the part
 * elsewhere, Position's knobs, the annotations and the measurements), then each alone — Parts (in an
 * assembly), Faces, Edges, and Position (where the file has joints: its knobs, the model picks nothing).
 */
export function stepSelectModes({ assembly, posable }) {
  return [
    { id: 'all', label: 'All', kinds: STEP_SELECT_DEFAULT, icon: modeIcon('references', 'all') },
    ...SELECT_GEOMETRY.filter(item => assembly || !item.assemblyOnly).map(item => ({ id: item.id, label: item.label, kinds: [item.id], icon: modeIcon('references', item.id) })),
    ...(posable ? [{ id: 'position', label: 'Position', kinds: ['position'], icon: modeIcon('references', 'position') }] : []),
  ];
}

/** Measure's modes on a part (`MEASURE_MODES`), each row drawn as the strip's Measure shows it. */
export const STEP_MEASURE_MODES = Object.freeze(MEASURE_MODES.map(mode => ({ ...mode, icon: modeIcon('measure', mode.id) })));

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
      <NxIcon name={SELECT_GROUP_ICON_NAMES[option.id]} className="size-3.5" />{option.label}
    </DropdownMenuCheckboxItem>) : null}
  </SelectFilterMenu>;
}
