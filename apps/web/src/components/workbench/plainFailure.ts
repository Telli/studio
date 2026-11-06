import type { OrchestrationV2ProviderFailureClass, RunId } from "@t3tools/contracts";

/**
 * What a failed turn says in the engineering interface: why it stopped, by its failure's class, in
 * plain words. The failure's own message is written for whoever runs the AI agent, and names its
 * provider and its server's logs. Code interfaces keep that message.
 */
const WORDS: Record<
  OrchestrationV2ProviderFailureClass,
  { readonly label: string; readonly detail: string }
> = {
  usage_limit: {
    label: "Usage limit reached",
    detail: "The AI agent has used its allowance for now.",
  },
  provider_error: {
    label: "The AI agent ran into a problem",
    detail: "It may be a passing fault on its side.",
  },
  transport_error: {
    label: "The connection to the AI agent dropped",
    detail: "Check this computer's internet connection.",
  },
  permission_error: {
    label: "The AI agent was refused",
    detail: "Check its sign-in under Settings, AI agents.",
  },
  validation_error: {
    label: "The AI agent could not take that request",
    detail: "Change what you asked and send it again.",
  },
  unknown: {
    label: "The AI agent ran into a problem",
    detail: "It gave no reason.",
  },
};

export function plainFailure(failureClass: OrchestrationV2ProviderFailureClass) {
  return WORDS[failureClass];
}

/** What Try again sends: the job goes on from where it stopped, never over what already finished. */
export const TRY_AGAIN_PROMPT =
  "Continue from your last step. Check what already finished before repeating anything.";

/** Whether a failed turn offers Try again: the latest run, and never a usage limit, which waits. */
export function offersTryAgain(input: {
  readonly failureClass: OrchestrationV2ProviderFailureClass;
  readonly runId: RunId | null;
  readonly latestFailedRunId: RunId | null;
}): boolean {
  return (
    input.failureClass !== "usage_limit" &&
    input.runId !== null &&
    input.runId === input.latestFailedRunId
  );
}
