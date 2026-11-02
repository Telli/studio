/**
 * When a plugin whose servers failed to list their tools is listed again on its own. A server can
 * fail for a while and then work (its runtime still installing, a network it needs coming back),
 * and until it is listed again agents have none of its tools. The first retry comes soon, then
 * further apart, up to every half hour, for as long as it keeps failing.
 */

const FIRST_RETRY_MS = 10_000;
const LONGEST_WAIT_MS = 30 * 60_000;

/** How long after a failed listing the next one waits: 10 s, 30 s, 90 s, ... up to 30 min. */
export const retryDelay = (attempt: number) =>
  Math.min(FIRST_RETRY_MS * 3 ** attempt, LONGEST_WAIT_MS);

export interface Retry {
  readonly attempt: number;
  readonly at: number;
}

/**
 * The plugins of `failing` to list again now, keeping `held` (each failing plugin's next retry) up
 * to date: a plugin no longer failing is forgotten, and one newly failing waits its first delay.
 */
export function dueRetries(
  failing: ReadonlyArray<string>,
  held: Map<string, Retry>,
  now: number,
): ReadonlyArray<string> {
  const failingNow = new Set(failing);
  for (const id of held.keys()) if (!failingNow.has(id)) held.delete(id);
  const due: Array<string> = [];
  for (const id of failingNow) {
    const retry = held.get(id);
    if (retry === undefined) {
      held.set(id, { attempt: 0, at: now + retryDelay(0) });
    } else if (now >= retry.at) {
      due.push(id);
      held.set(id, { attempt: retry.attempt + 1, at: now + retryDelay(retry.attempt + 1) });
    }
  }
  return due;
}
