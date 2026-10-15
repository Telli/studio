import { SettingsRow } from "../settings/settingsLayout";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  STUDIO_INTERFACE_AVAILABLE,
  type StudioInterface,
  setStudioInterface,
  useStudioInterface,
} from "./studioInterface";

const LABELS: Record<StudioInterface, string> = {
  engineering: "Engineering",
  both: "Engineering with code",
  code: "Code",
};

const DESCRIPTIONS: Record<StudioInterface, string> = {
  engineering:
    "Parts, checks and outputs first: the project's overview, the title block over the viewer, Check, Make and Document. Branches, diffs and the terminal stay out of the way.",
  both: "The engineering surfaces with every coding tool kept in view: the project's overview and the title block, plus branches, diffs, the terminal, source files and the agent's commands.",
  code: "Every coding tool in view: branches, diffs, the terminal and the agent's commands, for working on the code behind a model.",
};

const ORDER: ReadonlyArray<StudioInterface> = ["engineering", "both", "code"];

/** Settings, Appearance, Interface: Studio as an engineering app, a code editor, or engineering with the code tools. */
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
            const next = ORDER.find((entry) => entry === value);
            if (next !== undefined) setStudioInterface(next);
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-52" aria-label="Studio interface">
            <SelectValue>{LABELS[current]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {ORDER.map((value) => (
              <SelectItem key={value} hideIndicator value={value}>
                {LABELS[value]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}
