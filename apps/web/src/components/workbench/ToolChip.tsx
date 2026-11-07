import { ContextChip, ContextChipLabel } from "../ContextChip";
import type { HardwareAction } from "./hardwareActions";
import { MENU_TINTS } from "./kinds";
import { toolIcon } from "./toolIcons";

/** The tool a message came from (`toolUsed`), as the chat and the queue name it. */
export function ToolChip(props: { readonly tool: HardwareAction }) {
  const Icon = toolIcon(props.tool);
  return (
    <ContextChip>
      <Icon aria-hidden="true" className={MENU_TINTS[props.tool.group]} />
      <ContextChipLabel>{props.tool.label}</ContextChipLabel>
    </ContextChip>
  );
}
