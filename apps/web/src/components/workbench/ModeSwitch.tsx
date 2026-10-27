import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

type Mode = "ai" | "cad";

/**
 * The panel bar's switch between the two ways to change a part: AI, where a selection goes to the
 * agent, and CAD, the full modeling workspace. Held while a command or sketch is open in the view
 * in front, and says why on hover; the choice itself is Simple view's store (`simpleView.ts`).
 */
export function ModeSwitch(props: {
  readonly mode: Mode;
  readonly held: boolean;
  readonly onChange: (mode: Mode) => void;
}) {
  return (
    <Tooltip>
      {/* Hovered through a span: a held switch takes no pointer of its own, and says why. */}
      <TooltipTrigger render={<span className="flex shrink-0" />}>
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
          <ToggleGroupItem value="ai">AI</ToggleGroupItem>
          <ToggleGroupItem value="cad">CAD</ToggleGroupItem>
        </ToggleGroup>
      </TooltipTrigger>
      {props.held ? (
        <TooltipPopup side="bottom">Finish or cancel the command first</TooltipPopup>
      ) : null}
    </Tooltip>
  );
}
