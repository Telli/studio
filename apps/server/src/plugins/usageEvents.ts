/**
 * Studio's usage counts for what an engineer does in a CAD view: the `cad_http` routes that change
 * or open something, named by a fixed event and nothing of the request (no paths, files or sizes).
 * Reads and the build-state long poll are not counted, and neither is a request the CAD server did
 * not answer (a document still reading answers 202, and is asked again).
 */
import { isRecord } from "@t3tools/plugins";

import { HTTP_TOOL } from "./appCapability.ts";

const EVENTS: Readonly<Record<string, string>> = {
  "/api/v1/documents": "cad.model.opened",
  "/api/v1/local/edit/change": "cad.hand_edit",
  "/api/v1/local/sizes/set": "cad.size.changed",
  "/api/v1/local/sizes/add": "cad.size.added",
  "/api/v1/local/versions/compare": "cad.versions.compared",
  "/api/v1/local/versions/restore": "cad.version.restored",
};

/** The usage event a plugin request and its result count as, or null for one that is not counted. */
export function cadUsageEvent(method: string, params: unknown, result: unknown): string | null {
  if (method !== "tools/call" || !isRecord(params) || params.name !== HTTP_TOOL) return null;
  const args = isRecord(params.arguments) ? params.arguments : {};
  if (args.method !== "POST" || typeof args.url !== "string") return null;
  const reply = isRecord(result) ? result.structuredContent : null;
  if (!isRecord(reply) || (reply.status !== 200 && reply.status !== 201)) return null;
  const path = args.url.replace(/^[a-z]+:\/\/[^/]+/i, "").split(/[?#]/)[0];
  return EVENTS[path ?? ""] ?? null;
}
