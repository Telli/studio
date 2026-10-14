import { SettingsRow } from "../settings/settingsLayout";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  STUDIO_INTERFACE_AVAILABLE,
  type StudioInterface,
  setStudioInterface,
  useStudioInterface,
} from "./studioInterface";

const LABELS: Record<StudioInterface, string> = { engineering: "Engineering", code: "Code" };

const DESCRIPTIONS: Record<StudioInterface, string> = {
  engineering:
    "Parts, checks and outputs first: the title block over the viewer, Check, Make and Document, and the project's parts on a new thread. Branches, diffs and the terminal stay out of the way.",
  code: "Every coding tool in view: branches, diffs, the terminal and the agent's commands, for working on the code behind a model.",
};

/** Settings, Appearance, Interface: whether Studio looks like an engineering app or a code editor. */
export function StudioInterfaceSetting() {
  if (!STUDIO_INTERFACE_AVAILABLE) return null;
  return <StudioInterfaceRow />;
}

function StudioInterfaceRow() {
  const current = useStudioInterface();
  return (
    <SettingsRow
      id="studio-interface"
      title="Studio interface"
      description={DESCRIPTIONS[current]}
      control={
        <Select
          value={current}
          onValueChange={(value) => {
            if (value === "engineering" || value === "code") setStudioInterface(value);
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Studio interface">
            <SelectValue>{LABELS[current]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            <SelectItem hideIndicator value="engineering">
              {LABELS.engineering}
            </SelectItem>
            <SelectItem hideIndicator value="code">
              {LABELS.code}
            </SelectItem>
          </SelectPopup>
        </Select>
      }
    />
  );
}
