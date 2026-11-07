import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { chatStanding } from "./chatStanding";

/**
 * How a chat stands at its row's right end, in its tone: Needs you as a small filled dot, the words
 * its tooltip and name, so the chat's own name keeps the row's width; anything else in its word,
 * which `className` hides under the row's "…". The dot steps aside for the "…" instead, so its
 * tooltip can be reached.
 */
export function ChatStandingMark(props: {
  readonly standing: ReturnType<typeof chatStanding>;
  readonly className?: string;
}) {
  const { standing } = props;
  const mark = cn("shrink-0 text-right text-xs font-normal tabular-nums", standing.tone);
  if (standing.text !== "Needs you") {
    return <span className={cn(mark, props.className)}>{standing.text}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            aria-label={standing.text}
            className={cn(
              mark,
              "inline-flex size-3.5 items-center justify-center group-focus-within/chat:me-6 group-hover/chat:me-6",
            )}
          />
        }
      >
        <span aria-hidden="true" className="size-2 rounded-full bg-current" />
      </TooltipTrigger>
      <TooltipPopup side="top">{standing.text}</TooltipPopup>
    </Tooltip>
  );
}
