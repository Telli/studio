import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import {
  RICH_TOOLTIP_DELAY,
  Tooltip,
  TooltipPopup,
  TooltipRich,
  TooltipTrigger,
} from "../ui/tooltip";
import { CHAT_ICON, KIND_ICONS } from "./kinds";

type Mode = "ai" | "cad";

// Each mode as the switch shows it: the icon the rest of Studio gives a chat and a CAD file.
const MODES = [
  {
    mode: "ai",
    title: "AI",
    Icon: CHAT_ICON,
    description:
      "Change it by asking. Click a face or edge and say what you want; the agent edits the model.",
  },
  {
    mode: "cad",
    title: "CAD",
    Icon: KIND_ICONS.CAD,
    description:
      "Model it yourself. Sketch, extrude and edit features, with the tree and the toolbar, like NX or SolidWorks.",
  },
] as const;

/**
 * The panel bar's switch between the two ways to change a part: AI, where a selection goes to the
 * agent, and CAD, the full modeling workspace. Each option explains itself on a pause over it, and
 * a held switch (a command or sketch open in the view in front) says why instead; the choice
 * itself is Simple view's store (`simpleView.ts`).
 */
export function ModeSwitch(props: {
  readonly mode: Mode;
  readonly held: boolean;
  readonly onChange: (mode: Mode) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Editing mode"
      value={[props.mode]}
      disabled={props.held}
      onValueChange={(value) => {
        // Pressing the one in use clears the group: the mode stays as it is.
        const next = value[0];
        if (next === "ai" || next === "cad") props.onChange(next);
      }}
    >
      {MODES.map(({ mode, title, Icon, description }) => (
        <Tooltip key={mode}>
          {/* Hovered through a span: a held switch takes no pointer of its own, and says why. */}
          <TooltipTrigger delay={RICH_TOOLTIP_DELAY} render={<span className="flex" />}>
            <ToggleGroupItem value={mode}>
              <Icon aria-hidden="true" />
              {title}
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            <TooltipRich
              title={title}
              description={description}
              {...(props.held ? { note: "Finish or cancel the command first" } : {})}
            />
          </TooltipPopup>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
