import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { TooltipHint } from "@text-to-cad/ui/primitives/tooltip";
import { cn } from "@text-to-cad/ui/utils";

const BUTTON_CLASS = "flex items-center justify-center rounded-md border bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40";
const SIZE_CLASSES = Object.freeze({
  panel: "h-7 w-10 [&_svg]:size-4",
  corner: "size-10 shadow-sm [&_svg]:size-5",
});

/**
 * OK and Cancel as SolidWorks draws them: a green check and a red cross side by side, at the top
 * of a command's panel (`size="panel"`) and again in the model view's corner (`size="corner"`), so
 * the way to finish is where the eye already is. A sketch names them Exit Sketch and Discard
 * Changes. `okReason` says why OK waits (a hole needs its face), as its hint. Without `onOk`, the
 * cross alone: a command waiting for its plane has nothing to confirm yet.
 *
 * @param {{ onOk?: (() => void) | null, onCancel: () => void, okLabel?: string, cancelLabel?: string,
 *   okDisabled?: boolean, okReason?: string, busy?: boolean, size?: "panel" | "corner", className?: string }} props
 */
export function ConfirmButtons({ onOk = null, onCancel, okLabel = "OK", cancelLabel = "Cancel", okDisabled = false, okReason = "", busy = false,
  size = "panel", className }) {
  const sized = SIZE_CLASSES[size] || SIZE_CLASSES.panel;
  return <div className={cn("flex items-center gap-1", className)} data-cad-confirm={size}>
    {onOk ? <TooltipHint content={okReason || okLabel}>
      <span className="inline-flex">
        <button type="button" aria-label={okLabel} aria-description={okReason || undefined} disabled={okDisabled || busy}
          className={cn(BUTTON_CLASS, sized, "border-cad-ok/45 text-cad-ok hover:bg-cad-ok/10")} onClick={onOk}>
          <Check strokeWidth={2.75} aria-hidden="true" />
        </button>
      </span>
    </TooltipHint> : null}
    <TooltipHint content={cancelLabel}>
      <button type="button" aria-label={cancelLabel} disabled={busy}
        className={cn(BUTTON_CLASS, sized, "border-cad-cancel/45 text-cad-cancel hover:bg-cad-cancel/10")} onClick={onCancel}>
        <X strokeWidth={2.75} aria-hidden="true" />
      </button>
    </TooltipHint>
  </div>;
}

/**
 * The same OK and Cancel in the model view's top-right corner, as SolidWorks' confirmation corner:
 * drawn by the panel that owns them into the corner the view keeps for them (`node`), so both
 * finish the command the same way. Nothing when the view has no corner (a host without one).
 */
export function ConfirmCorner({ node, ...props }) {
  return node ? createPortal(<ConfirmButtons size="corner" {...props} />, node) : null;
}
