import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

import { knownModelScript, knownModelTitle } from "./useFolderModels";

/**
 * A part named in a job's message (the Toolbox's, Cmd+K's, a new chat's starters): a file by a link
 * to it, as ever. A cadgen 0.8 model by a link to its script under the part's name, as the agent
 * edits the script and runs the model from it; its document id is never written, and before its
 * folder is read the part is named alone. `scriptOf` finds a model's script (the folders' models).
 */
export function partLink(
  part: { readonly path: string; readonly name?: string | undefined },
  scriptOf: (id: string) => string | undefined = knownModelScript,
): string {
  if (!isDocumentId(part.path)) return serializeComposerFileLink(part.path);
  const name = part.name ?? knownModelTitle(part.path) ?? "the part";
  const script = scriptOf(part.path);
  return script === undefined ? name : serializeComposerFileLink(script, name);
}
