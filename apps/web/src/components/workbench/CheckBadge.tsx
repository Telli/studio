import { CircleCheckIcon, CircleXIcon, type LucideIcon, TriangleAlertIcon } from "lucide-react";

import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { CheckResult, CheckStatus } from "./checkResults";

/** How a check went, as its badge and the words around it say it. */
export const CHECK_STATUS: Record<
  CheckStatus,
  {
    readonly variant: "error" | "warning" | "success";
    /** How one check went: "Casting fails". */
    readonly word: string;
    /** How a part's checks went: "a check fails". */
    readonly caption: string;
    readonly Icon: LucideIcon;
  }
> = {
  fix: { variant: "error", word: "fails", caption: "a check fails", Icon: CircleXIcon },
  warnings: {
    variant: "warning",
    word: "passes with warnings",
    caption: "checks pass with warnings",
    Icon: TriangleAlertIcon,
  },
  ready: { variant: "success", word: "passes", caption: "checks pass", Icon: CircleCheckIcon },
};

/** One check of a part: its name and how it went, its verdict on hover, and its result on a click. */
export function CheckBadge(props: { readonly result: CheckResult; readonly onOpen: () => void }) {
  const { result } = props;
  const { variant, word, Icon } = CHECK_STATUS[result.status];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={props.onOpen}
            aria-label={`${result.check} ${word}: ${result.headline}. Show the result`}
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
        }
      >
        <Badge variant={variant}>
          <Icon aria-hidden="true" />
          {result.check}
        </Badge>
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-80">
        {result.headline}
      </TooltipPopup>
    </Tooltip>
  );
}
