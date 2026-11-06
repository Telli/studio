import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import type { chatStanding } from "./chatStanding";

/** How a chat stands at its row's right end: Needs you as Home's tile says it, else in its tone. */
export function ChatStandingMark(props: {
  readonly standing: ReturnType<typeof chatStanding>;
  readonly className?: string;
}) {
  const { standing } = props;
  return (
    <span
      className={cn(
        "shrink-0 text-right text-xs font-normal tabular-nums",
        standing.tone,
        props.className,
      )}
    >
      {standing.text === "Needs you" ? <Badge variant="info">Needs you</Badge> : standing.text}
    </span>
  );
}
