import { Check, X } from "lucide-react";
import { TooltipHint } from "@text-to-cad/ui/primitives/tooltip";
import { cn } from "@text-to-cad/ui/utils";

const BUTTON_CLASS = "flex h-7 w-10 items-center justify-center rounded-md border bg-background [&_svg]:size-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40";

/**
 * OK and Cancel as SolidWorks draws them: a green check and a red cross side by side, in the title
 * row of a command's card over the model, so the way to finish is where the eye already is. A
 * sketch names them Exit Sketch and Discard Changes. `okReason` says why OK waits (a hole needs its
 * face), as its hint. Without `onOk`, the cross alone: a command waiting for its plane has nothing
 * to confirm yet.
 *
 * @param {{ onOk?: (() => void) | null, onCancel: () => void, okLabel?: string, cancelLabel?: string,
 *   okDisabled?: boolean, okReason?: string, busy?: boolean, className?: string }} props
 */
export function ConfirmButtons({ onOk = null, onCancel, okLabel = "OK", cancelLabel = "Cancel", okDisabled = false, okReason = "", busy = false,
  className }) {
  return <div className={cn("flex items-center gap-1", className)} data-cad-confirm="">
    {onOk ? <TooltipHint content={okReason || okLabel}>
      <span className="inline-flex">
        <button type="button" aria-label={okLabel} aria-description={okReason || undefined} disabled={okDisabled || busy}
          className={cn(BUTTON_CLASS, "border-cad-ok/45 text-cad-ok hover:bg-cad-ok/10")} onClick={onOk}>
          <Check strokeWidth={2.75} aria-hidden="true" />
        </button>
      </span>
    </TooltipHint> : null}
    <TooltipHint content={cancelLabel}>
      <button type="button" aria-label={cancelLabel} disabled={busy}
        className={cn(BUTTON_CLASS, "border-cad-cancel/45 text-cad-cancel hover:bg-cad-cancel/10")} onClick={onCancel}>
        <X strokeWidth={2.75} aria-hidden="true" />
      </button>
    </TooltipHint>
  </div>;
}
