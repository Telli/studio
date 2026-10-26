/**
 * The finished sample project the desktop app ships (`studio-sample/servo-bracket`), and how its
 * copy is found again: Try a sample project and See the example open the copy made before, and
 * make one only when there is none (`useSampleProject`).
 */

import type { StudioProject } from "@t3tools/contracts";

/** The sample's copy's name in Studio, the first thing `findSample` looks for. */
export const SAMPLE_NAME = "Servo bracket (sample)";

/** The file at the top of the sample, and so of every copy of it, that says what it is. */
export const SAMPLE_MARKER = "studio-sample.json";

/**
 * The copy's Purpose in its brief, which every chat in it reads: what the finished project is, as
 * its README opens. Never a job to do, so no chat sets out to make it again (Home's prompt for the
 * agent to build it is `SAMPLE_PROJECT`).
 */
export const SAMPLE_PURPOSE =
  "A mounting bracket for an MG996R servo, bent from 2 mm 5052-H32 aluminium sheet: a sample project to learn Studio with.";

/**
 * The copy of the sample made before: the first project named `SAMPLE_NAME` whose first folder
 * holds the sample's marker (`isMarked`). A project of yours that only shares the name is not it,
 * and no other project's folder is read.
 */
export async function findSample(
  projects: Readonly<Record<string, StudioProject>>,
  isMarked: (folder: string) => Promise<boolean>,
) {
  for (const [id, project] of Object.entries(projects)) {
    const folder = project.folders[0];
    if (project.name !== SAMPLE_NAME || folder === undefined) continue;
    if (await isMarked(folder)) return { id, project };
  }
  return null;
}

/**
 * Copies the sample into a new project's folder: its top-level files and folders but the marker,
 * then its README in place of the one the folder starts with, then the marker last, so a copy cut
 * short is never taken for the sample (`findSample`). A step that fails throws, and none after it
 * runs, so the copy is not reported made.
 */
export async function copySample(steps: {
  /** The sample's top-level entries the folder lacks (`copiedEntries`), the marker among them. */
  readonly entries: ReadonlyArray<string>;
  /** Copies entries of the sample into the folder. */
  readonly copy: (entries: ReadonlyArray<string>) => Promise<unknown>;
  /** Writes the sample's README over the folder's own; null when the sample has none. */
  readonly writeReadme: (() => Promise<void>) | null;
}) {
  await steps.copy(steps.entries.filter((entry) => entry !== SAMPLE_MARKER));
  await steps.writeReadme?.();
  if (steps.entries.includes(SAMPLE_MARKER)) await steps.copy([SAMPLE_MARKER]);
}

/**
 * How Try a sample project starts: "copy" opens the finished sample, where the server ships one
 * and this computer can copy it (the desktop app); elsewhere "prompt" starts the prompt in which
 * the agent builds it.
 */
export function sampleMode(input: {
  readonly sampleProject: string | null;
  readonly canCopy: boolean;
}) {
  return input.sampleProject !== null && input.canCopy ? "copy" : "prompt";
}

/**
 * Runs `work` once the work already under way for `key` has finished, so of two opens of the
 * sample the second finds the copy the first made rather than making another.
 */
export function inTurn<T>(
  underWay: Map<string, Promise<unknown>>,
  key: string,
  work: () => Promise<T>,
) {
  const next = (underWay.get(key) ?? Promise.resolve()).then(work);
  // What the next one waits for: this one finished, whether it worked or not.
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  underWay.set(key, settled);
  void settled.then(() => {
    if (underWay.get(key) === settled) underWay.delete(key);
  });
  return next;
}
