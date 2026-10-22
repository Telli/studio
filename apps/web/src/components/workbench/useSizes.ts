import { useEffect, useState } from "react";

import { type ProjectSizes, readSizes } from "./sizes";
import type { CadPost } from "./useVersions";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const failure = (reply: unknown) =>
  isRecord(reply) && typeof reply.error === "string"
    ? reply.error
    : "Studio's CAD service did not answer.";

/**
 * A project folder's named sizes (`cadgen/edit/sizes.py`), read again whenever the thread's agent
 * changes files or a size is changed here (`reads`). The last list stays shown while it is read.
 */
export function useProjectSizes(input: {
  readonly post: CadPost | null;
  readonly folder: string;
  readonly mutationId: string | null;
  readonly reads: number;
}): { readonly sizes: ProjectSizes | null; readonly error: string | null } | null {
  const { post, folder, mutationId, reads } = input;
  const [state, setState] = useState<{
    readonly folder: string;
    readonly sizes: ProjectSizes | null;
    readonly error: string | null;
  } | null>(null);
  useEffect(() => {
    if (post === null || folder === "") return;
    let cancelled = false;
    void post("/__cad/sizes", { folder }).then((reply) => {
      if (cancelled) return;
      const read = readSizes(reply);
      setState(
        "error" in read
          ? { folder, sizes: null, error: read.error }
          : { folder, sizes: read, error: null },
      );
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `mutationId` is the agent changing files, `reads` a size changed here: the sizes are read again.
  }, [folder, mutationId, post, reads]);
  return state !== null && state.folder === folder ? state : null;
}

/**
 * One size changed where it is written (`cadgen/edit/sizes.py` `set_size`), then the parts that
 * use its file built again. Resolves to those parts, or the CAD service's reason.
 */
export async function changeSize(
  post: CadPost,
  input: {
    readonly folder: string;
    readonly file: string;
    readonly name: string;
    readonly line: number;
    readonly old: string;
    readonly text: string;
  },
): Promise<{ readonly parts: ReadonlyArray<string> } | { readonly error: string }> {
  const reply = await post("/__cad/sizes/set", input);
  if (isRecord(reply) && reply.ok === true) {
    return {
      parts: Array.isArray(reply.parts)
        ? reply.parts.filter((part): part is string => typeof part === "string")
        : [],
    };
  }
  return { error: failure(reply) };
}

/** A shared size added to `sizes.py` beside the parts. Resolves to its file, or the reason. */
export async function addSharedSize(
  post: CadPost,
  input: {
    readonly folder: string;
    readonly name: string;
    readonly text: string;
    readonly note: string;
  },
): Promise<{ readonly file: string } | { readonly error: string }> {
  const reply = await post("/__cad/sizes/add", input);
  return isRecord(reply) && reply.ok === true && typeof reply.file === "string"
    ? { file: reply.file }
    : { error: failure(reply) };
}
