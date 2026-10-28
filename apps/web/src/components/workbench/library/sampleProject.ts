/**
 * How an example Studio ships (`studio-sample/<id>/`) is copied into a project of yours
 * (`useExample`): its files, then its README, never its marker; and one copy at a time, so a
 * second copy is named past the first.
 */

/** The servo bracket: the example the Library's examples are in, unless one names another. */
export const SAMPLE_ID = "servo-bracket";

/** The file at the top of an example that says what it is; a copy is a project, so it stays out. */
export const SAMPLE_MARKER = "studio-sample.json";

/**
 * Copies an example into a new project's folder: its top-level files and folders but the marker,
 * then its README in place of the one the folder starts with. A step that fails throws, and none
 * after it runs, so the copy is not reported made.
 */
export async function copySample(steps: {
  /** The example's top-level entries the folder lacks (`copiedEntries`). */
  readonly entries: ReadonlyArray<string>;
  /** Copies entries of the example into the folder. */
  readonly copy: (entries: ReadonlyArray<string>) => Promise<unknown>;
  /** Writes the example's README over the folder's own; null when the example has none. */
  readonly writeReadme: (() => Promise<void>) | null;
}) {
  await steps.copy(steps.entries.filter((entry) => entry !== SAMPLE_MARKER));
  await steps.writeReadme?.();
}

/** Whether an example's file is a model's script, which a copy opens by the document it builds. */
export function isModelScript(file: string): boolean {
  return file.toLowerCase().endsWith(".py");
}

/** What building a copy's model script answered (`buildPart`): its document, or why it did not build. */
type Built = { readonly id: string } | { readonly error: string };

/**
 * Opens a copy of an example on its file: a model script by the document its build made (`built`;
 * a copy's models were never built, so the copy builds the one it opens on), else the file as it
 * is. A script whose build failed opens as the script, and `failed` says why.
 */
export function openCopiedExample(steps: {
  readonly file: string;
  /** The file's build, for a model script; null for any other file. */
  readonly built: Built | null;
  readonly openDocument: (id: string) => void;
  readonly openFile: (file: string) => void;
  readonly failed: (error: string) => void;
}): void {
  if (steps.built !== null && "id" in steps.built) {
    steps.openDocument(steps.built.id);
    return;
  }
  steps.openFile(steps.file);
  if (steps.built !== null) steps.failed(steps.built.error);
}

/**
 * Runs `work` once the work already under way for `key` has finished, so of two copies of an
 * example the second reads the project the first made and takes the next name.
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
