import { TEXT_TO_CAD } from "../workbench/library/skillAvailability";

/**
 * Whether a view's message goes to the chat at its press, without "Send this message from…?":
 * only Studio's own CAD viewer (Quick Edit's Send), only while its frame has focus, and only
 * from a press the person just made, the guard `openLink` uses, so no view sends on its own.
 */
export function sendsWithoutAsking(input: {
  readonly studio: boolean;
  readonly pluginId: string;
  readonly focused: boolean;
  readonly activated: boolean;
}): boolean {
  return input.studio && input.pluginId === TEXT_TO_CAD && input.focused && input.activated;
}
