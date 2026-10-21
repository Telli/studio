import { engineeringStepLabel } from "../workbench/engineeringLabels";
import { isEngineeringInterface } from "../workbench/studioInterface";
import { memo } from "react";
import { type PendingApproval } from "../../session-logic";
import { cn } from "~/lib/utils";

interface ComposerPendingApprovalPanelProps {
  approval: PendingApproval;
  pendingCount: number;
  className?: string;
}

export const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  pendingCount,
  className,
}: ComposerPendingApprovalPanelProps) {
  // Studio says what the agent asks to do in its own words; the command stays out of the way.
  const studio = isEngineeringInterface();
  const Detail = approval.requestKind === "mcp-elicitation" || studio ? "span" : "code";
  const studioLabel =
    approval.requestKind === "command"
      ? "Asks to go ahead"
      : approval.requestKind === "file-read"
        ? "Asks to read a file"
        : approval.requestKind === "permission" || approval.requestKind === "mcp-elicitation"
          ? "Asks for access"
          : "Asks to change files";
  const studioDetail =
    approval.requestKind === "command" && approval.detail
      ? engineeringStepLabel(approval.detail).doing
      : approval.detail;
  const fallbackLabel = studio
    ? studioLabel
    : approval.requestKind === "mcp-elicitation"
      ? "App access approval"
      : approval.requestKind === "command"
        ? "Command approval"
        : approval.requestKind === "file-read"
          ? "File read approval"
          : approval.requestKind === "permission"
            ? "App permission approval"
            : "File change approval";
  const detailAriaLabel =
    approval.requestKind === "mcp-elicitation"
      ? "App access request"
      : approval.requestKind === "command"
        ? "Command"
        : approval.requestKind === "file-read"
          ? "File to read"
          : approval.requestKind === "permission"
            ? "Permission request"
            : "File change";

  return (
    <span
      aria-label={fallbackLabel}
      className={cn("flex min-w-0 flex-1 flex-col items-start gap-1", className)}
      role="group"
    >
      <span className="flex w-full min-w-0 items-center gap-2 text-2xs text-muted-foreground">
        <span className="shrink-0 font-medium text-warning">{fallbackLabel}</span>
        {approval.appName ? <span className="min-w-0 truncate">{approval.appName}</span> : null}
        {pendingCount > 1 ? (
          <span className="ml-auto shrink-0 tabular-nums">1/{pendingCount}</span>
        ) : null}
      </span>
      <Detail
        aria-label={detailAriaLabel}
        className={cn(
          "block max-h-20 w-full min-w-0 overflow-auto text-xs text-foreground [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 [&::-webkit-scrollbar]:h-1.5",
          approval.requestKind === "mcp-elicitation" || studio
            ? "whitespace-pre-wrap font-sans wrap-break-word"
            : "whitespace-pre font-mono",
        )}
        data-approval-detail="complete"
        tabIndex={0}
      >
        {approval.responseCapability === "not_resumable"
          ? studio
            ? "The AI agent has stopped. Stop this work and ask again to answer it."
            : "Provider process is gone — interrupt or restart the run to respond."
          : (studio ? studioDetail : approval.detail) || fallbackLabel}
      </Detail>
    </span>
  );
});
