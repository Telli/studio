import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { useAtomCommand } from "~/state/use-atom-command";

/** Pictures by project and path, for the session: a page shown again draws at once. */
const pictureCache = new Map<string, string | null>();
/** The server renders at most this many pictures per call. */
const BATCH = 24;

/**
 * Pictures of the project's models, boards and drawings, rendered on the
 * server by the CAD plugin (`plugins.modelPictures`, cached there by file
 * size and time), a batch at a time, the first files first.
 */
export function usePictures(input: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly paths: ReadonlyArray<string>;
}): ReadonlyMap<string, string> {
  const { environmentId, cwd } = input;
  const render = useAtomCommand(pluginEnvironment.modelPictures, { reportFailure: false });
  const [, setRevision] = useState(0);
  const wanted = input.paths.join("\n");

  useEffect(() => {
    if (wanted === "") return;
    let cancelled = false;
    const missing = wanted.split("\n").filter((path) => !pictureCache.has(`${cwd}\n${path}`));
    void (async () => {
      for (let start = 0; start < missing.length; start += BATCH) {
        if (cancelled) return;
        const result = await render({
          environmentId,
          input: { cwd, paths: missing.slice(start, start + BATCH) },
        });
        if (result._tag !== "Success") return;
        for (const picture of result.value.pictures) {
          pictureCache.set(
            `${cwd}\n${picture.path}`,
            picture.png === null ? null : `data:image/png;base64,${picture.png}`,
          );
        }
        if (!cancelled) setRevision((value) => value + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [render, environmentId, cwd, wanted]);

  const pictures = new Map<string, string>();
  for (const path of input.paths) {
    const picture = pictureCache.get(`${cwd}\n${path}`);
    if (picture) pictures.set(path, picture);
  }
  return pictures;
}
