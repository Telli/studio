import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { useAtomCommand } from "~/state/use-atom-command";
import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";

import {
  describePart,
  documentOf,
  type PartContext,
  readBuild,
  readDocumentId,
  readDocumentKind,
  readDocumentName,
  readMaterials,
  readTunnelJson,
  readUpdated,
  sharedLoad,
  type ShownView,
} from "./partContext";
import { useShownView } from "./shownModels";

/** What the engine and Recents say about one revision of a document. */
interface FileFacts {
  readonly key: string;
  readonly path: string;
  readonly kind: string | null;
  readonly name: string | null;
  /** Null when the document could not be read, or the engine holds none of it yet. */
  readonly materials: ReadonlyArray<string> | null;
  /** Its build (`/version`), null where it has none to read. */
  readonly version: unknown;
  readonly updated: number | null;
}

/** What the routes answered for one revision. */
interface Read {
  readonly structure: unknown;
  readonly version: unknown;
  readonly recents: unknown;
}

/** The routes' reads under way, by thread and revision (`sharedLoad`). */
const FACTS_IN_FLIGHT = new Map<string, Promise<Read>>();

const factsKey = (shown: ShownView) =>
  [shown.pluginId, shown.server, shown.path, shown.revision].join("\n");

/**
 * The part the thread's viewer shows. Which document and its revision come with
 * the view's own sync; what it is, its materials, its build and when it last
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
    const load = async (): Promise<Read> => {
      const target = documentOf(shown.path);
      const id =
        target === null
          ? null
          : "id" in target
            ? target.id
            : readDocumentId(await route(`/__cad/xbf?file=${encodeURIComponent(target.file)}`));
      const doc = id === null ? null : `/__cad/api/doc/${encodeURIComponent(id)}`;
      const [structure, version, recents] = await Promise.all([
        doc === null ? null : route(doc),
        doc === null ? null : route(`${doc}/version`),
        route("/__cad/recents"),
      ]);
      return { structure, version, recents };
    };
    void sharedLoad(
      FACTS_IN_FLIGHT,
      [threadRef.environmentId, threadRef.threadId, key].join("\n"),
      load,
    ).then(({ structure, version, recents }) => {
      if (cancelled) return;
      setFacts({
        key,
        path: shown.path,
        kind: readDocumentKind(structure),
        name: readDocumentName(structure),
        materials: structure === null ? null : readMaterials(structure),
        version,
        updated: readUpdated(recents, shown.path),
      });
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `key` names the document and revision `shown` holds; a sync that changes nothing else must not read them again.
  }, [key, request, threadRef.environmentId, threadRef.threadId]);

  if (shown === null) return null;
  // Until this revision's facts arrive, the last revision's stand for the same file.
  const current = facts !== null && facts.path === shown.path ? facts : null;
  return {
    pluginId: shown.pluginId,
    part: {
      path: shown.path,
      ...describePart(shown.path, current?.kind ?? null, current?.name ?? null),
      materials: current?.materials ?? null,
      build:
        current === null
          ? null
          : readBuild(current.version, current.updated, isDocumentId(shown.path)),
    },
  };
}
