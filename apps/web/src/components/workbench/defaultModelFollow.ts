import type { ModelSelection } from "@t3tools/contracts";

/**
 * The engineering composer has no model picker, so a model chosen in Settings, AI agents must
 * also reach the chat that is open: its next turn uses the new choice. Settings and the chat
 * are different screens, so the chat notices the change when it is next in front: it keeps the
 * default it last saw per project (`seenDefaults`) and, when the saved default differs, applies
 * the new one through the picker's own path (`onProviderModelSelect`), which keeps the
 * provider-lock check and its toast. The default stays saved either way.
 */
const seenDefaults = new Map<string, ModelSelection | null>();

const sameSelection = (a: ModelSelection | null, b: ModelSelection | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.instanceId === b.instanceId &&
    a.model === b.model &&
    JSON.stringify(a.options ?? []) === JSON.stringify(b.options ?? []));

/**
 * The selection to put on the open chat, or null. Only the engineering interface follows, only
 * for a default that changed since the chat last looked (the first look just remembers it), and
 * never for a default reset to Automatic, which has nothing to apply.
 */
export function defaultModelToApply(input: {
  readonly engineering: boolean;
  readonly current: ModelSelection | null;
  readonly seen: ModelSelection | null | undefined;
}): ModelSelection | null {
  if (!input.engineering || input.seen === undefined || input.current === null) return null;
  return sameSelection(input.seen, input.current) ? null : input.current;
}

/** Reads and remembers a project's default as the open chat sees it; returns what to apply. */
export function takeDefaultModelChange(
  projectKey: string,
  engineering: boolean,
  current: ModelSelection | null,
): ModelSelection | null {
  const apply = defaultModelToApply({
    engineering,
    current,
    seen: seenDefaults.get(projectKey),
  });
  seenDefaults.set(projectKey, current);
  return apply;
}
