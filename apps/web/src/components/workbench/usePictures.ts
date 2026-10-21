import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { useAtomCommand } from "~/state/use-atom-command";

/** A file's picture, or none yet and when that was learned. */
interface Cached {
  readonly picture: string | null;
  readonly at: number;
}

/** Pictures by project and path, for the session: a page shown again draws at once. */
const pictureCache = new Map<string, Cached>();
/** The server renders at most this many pictures per call. */
const BATCH = 24;
/**
 * A file that came back without a picture is asked for again after this long, a few times while
 * its page is shown: the CAD plugin may still be starting (it updates on launch), or a render
 * failed, and a session-long "none" left Home's tiles blank.
 */
const RETRY_MS = 20_000;
const TRIES = 3;

const wantsPicture = (key: string, now: number) => {
  const cached = pictureCache.get(key);
  return cached === undefined || (cached.picture === null && now - cached.at >= RETRY_MS);
};

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
  const [tries, setTries] = useState(0);
  const wanted = input.paths.join("\n");

  useEffect(() => {
    if (wanted === "") return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const missing = wanted
      .split("\n")
      .filter((path) => wantsPicture(`${cwd}\n${path}`, Date.now()));
    void (async () => {
      let unpictured = false;
      for (let start = 0; start < missing.length; start += BATCH) {
        if (cancelled) return;
        const result = await render({
          environmentId,
          input: { cwd, paths: missing.slice(start, start + BATCH) },
        });
        if (result._tag !== "Success") {
          unpictured = true;
          break;
        }
        for (const picture of result.value.pictures) {
          if (picture.png === null) unpictured = true;
          pictureCache.set(`${cwd}\n${picture.path}`, {
            picture: picture.png === null ? null : `data:image/png;base64,${picture.png}`,
            at: Date.now(),
          });
        }
        if (!cancelled) setRevision((value) => value + 1);
      }
      if (unpictured && !cancelled && tries < TRIES) {
        retry = setTimeout(() => setTries((value) => value + 1), RETRY_MS + 500);
      }
    })();
    return () => {
      cancelled = true;
      if (retry !== undefined) clearTimeout(retry);
    };
  }, [render, environmentId, cwd, wanted, tries]);

  const pictures = new Map<string, string>();
  for (const path of input.paths) {
    const picture = pictureCache.get(`${cwd}\n${path}`)?.picture;
    if (picture) pictures.set(path, picture);
  }
  return pictures;
}
