import {
  CircleCheckIcon,
  CircleXIcon,
  HistoryIcon,
  type LucideIcon,
  TriangleAlertIcon,
} from "lucide-react";

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

/** How a check of a part since changed is marked, wherever it is said. */
export const OutOfDateIcon = HistoryIcon;

/** What a check of a part since changed says, in place of its verdict. */
const OUT_OF_DATE = "Part changed since this check";

/**
 * One check of a part: its name and how it went, its verdict on hover, and its result on a click.
 * A check of a part since changed (`checkOutOfDate`) is an outline, no status color: it no longer
 * passes or fails anything, and its result is still a click away.
 */
export function CheckBadge(props: {
  readonly result: CheckResult;
  readonly outOfDate?: boolean;
  readonly onOpen: () => void;
}) {
  const { result, outOfDate = false } = props;
  const { variant, word, Icon } = CHECK_STATUS[result.status];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={props.onOpen}
            aria-label={
              outOfDate
                ? `${result.check}: ${OUT_OF_DATE}. Show the result`
                : `${result.check} ${word}: ${result.headline}. Show the result`
            }
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
        }
      >
        {outOfDate ? (
          <Badge variant="outline">
            <OutOfDateIcon aria-hidden="true" />
            {result.check}
          </Badge>
        ) : (
          <Badge variant={variant}>
            <Icon aria-hidden="true" />
            {result.check}
          </Badge>
        )}
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-80">
        {outOfDate ? OUT_OF_DATE : result.headline}
      </TooltipPopup>
    </Tooltip>
  );
}
