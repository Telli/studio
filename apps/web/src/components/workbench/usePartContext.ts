import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  describePart,
  type PartContext,
  readBuild,
  readCatalogEntry,
  readCatalogKind,
  readMaterials,
  readModified,
  readTunnelJson,
  sharedLoad,
  type ShownView,
} from "./partContext";
import { useShownView } from "./shownModels";

/** What the catalog and the library say about one revision of a file. */
interface FileFacts {
  readonly key: string;
  readonly path: string;
  readonly kind: string | null;
  /** Null when the catalog could not be read, or has no row for the file yet. */
  readonly materials: ReadonlyArray<string> | null;
  readonly modified: number | null;
}

/** The routes' reads under way, by thread and revision (`sharedLoad`). */
const FACTS_IN_FLIGHT = new Map<string, Promise<readonly [unknown, unknown]>>();

const factsKey = (shown: ShownView) =>
  [shown.pluginId, shown.server, shown.path, shown.revision].join("\n");

/**
 * The part the thread's viewer shows. Which model, its revision and its build
 * come with the view's own sync; what it is, its materials and when it last
 * changed are read once per revision through the viewer's routes. Null until
 * the viewer has shown a model this session.
 */
export function usePartContext(threadRef: ScopedThreadRef): {
  readonly part: PartContext;
  readonly pluginId: string;
} | null {
  const shown = useShownView(threadRef);
  const request = useAtomCommand(pluginEnvironment.request, { reportFailure: false });
  const [facts, setFacts] = useState<FileFacts | null>(null);
  const key = shown === null ? null : factsKey(shown);

  useEffect(() => {
    if (shown === null || key === null) return;
    let cancelled = false;
    const route = async (url: string) => {
      const result = await request({
        environmentId: threadRef.environmentId,
        input: {
          threadId: threadRef.threadId,
          pluginId: shown.pluginId,
          server: shown.server,
          method: "tools/call",
          params: { name: "cad_http", arguments: { method: "GET", url } },
        },
      });
      return result._tag === "Success"
        ? readTunnelJson(result.value.result).catch(() => null)
        : null;
    };
    // Every caller showing this revision shares one read of the routes (`sharedLoad`).
    void sharedLoad(
      FACTS_IN_FLIGHT,
      [threadRef.environmentId, threadRef.threadId, key].join("\n"),
      () =>
        Promise.all([
          route(`/__cad/catalog?file=${encodeURIComponent(shown.path)}`),
          route("/__cad/recents"),
        ]),
    ).then(([catalog, recents]) => {
      if (cancelled) return;
      const entry = readCatalogEntry(catalog);
      setFacts({
        key,
        path: shown.path,
        kind: readCatalogKind(catalog),
        materials: entry === null ? null : readMaterials(entry),
        modified: readModified(recents, shown.path),
      });
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `key` names the file and revision `shown` holds; a sync that changes only the build feed must not read the catalog again.
  }, [key, request, threadRef.environmentId, threadRef.threadId]);

  if (shown === null) return null;
  // Until this revision's facts arrive, the last revision's stand for the same file.
  const current = facts !== null && facts.path === shown.path ? facts : null;
  return {
    pluginId: shown.pluginId,
    part: {
      path: shown.path,
      ...describePart(shown.path, current?.kind ?? null),
      materials: current?.materials ?? null,
      build: readBuild(shown.preview, current?.modified ?? null),
    },
  };
}
