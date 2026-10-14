/**
 * The part, board or assembly a text-to-cad viewer shows, as the workbench's
 * context strip names it: what it is, its units, its material and its last
 * build. The viewer's own sync (`cad_sync`, relayed by the frame) says which
 * model it shows, its revision and the build feed of a STEP; the viewer's
 * routes, reached through `cad_http` as the view reaches them, say the rest
 * once per revision. Nothing is guessed: a fact the server does not hold is
 * left out, or said to be missing.
 */

/** What a thread's viewer shows, from its last sync. */
export interface ShownView {
  /** The plugin and server the view belongs to, which answer `cad_http`. */
  readonly pluginId: string;
  readonly server: string;
  /** Absolute path. */
  readonly path: string;
  /** Moves whenever the file does: the catalog's revision, else the viewer's own. */
  readonly revision: string;
  /** The build feed's current word on a STEP the view watches; null for any other file. */
  readonly preview: Record<string, unknown> | null;
}

export type PartBuild =
  | { readonly state: "building" }
  | { readonly state: "failed"; readonly error: string | null }
  /** `built`: a cadgen build saved it; `saved`: only the file's own time is known. */
  | { readonly state: "built" | "saved"; readonly at: number };

export interface PartContext {
  readonly path: string;
  readonly name: string;
  /** "Part", "Assembly", "Board", "FEA study"... */
  readonly kind: string;
  /** The units the viewer reads the file in, or null where the file alone does not say. */
  readonly units: string | null;
  /** Named materials the model declares: empty when it declares none, null until read. */
  readonly materials: ReadonlyArray<string> | null;
  readonly build: PartBuild | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A path's last segment, on either separator. */
export const fileName = (path: string) =>
  path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1) || path;

/**
 * Compound endings first: results are named after the model they came from
 * (`bracket.fea.glb`). Units are the viewer's: CAD files in millimetres,
 * robot descriptions in metres (`renderOptions.js`); a DXF carries its own,
 * which only its drawing payload reads, and a schematic has none.
 */
const KINDS: ReadonlyArray<{
  readonly ending: string;
  readonly kind: string;
  readonly units: string | null;
}> = [
  { ending: ".fea.glb", kind: "FEA study", units: "mm" },
  { ending: ".cam.glb", kind: "CAM job", units: "mm" },
  { ending: ".harness.yml", kind: "Harness", units: null },
  { ending: ".kicad_pcb", kind: "Board", units: "mm" },
  { ending: ".kicad_sch", kind: "Schematic", units: null },
  { ending: ".step", kind: "Part", units: "mm" },
  { ending: ".stp", kind: "Part", units: "mm" },
  { ending: ".stl", kind: "Mesh", units: "mm" },
  { ending: ".3mf", kind: "Mesh", units: "mm" },
  { ending: ".glb", kind: "Mesh", units: "mm" },
  { ending: ".dxf", kind: "Drawing", units: null },
  { ending: ".urdf", kind: "Robot", units: "m" },
  { ending: ".srdf", kind: "Planning groups", units: "m" },
  { ending: ".sdf", kind: "Simulation model", units: "m" },
];

/** What the file is and what it is called, from its path and the catalog's `kind` for a STEP. */
export function describePart(
  path: string,
  catalogKind: string | null,
): Pick<PartContext, "name" | "kind" | "units"> {
  const file = fileName(path);
  const lower = file.toLowerCase();
  const match = KINDS.find((entry) => lower.endsWith(entry.ending) && lower !== entry.ending);
  if (match === undefined) return { name: file, kind: "File", units: null };
  const name = file.slice(0, file.length - match.ending.length);
  const kind = match.kind === "Part" && catalogKind === "assembly" ? "Assembly" : match.kind;
  return { name, kind, units: match.units };
}

const samePath = (a: string, b: string) => a.replaceAll("\\", "/") === b.replaceAll("\\", "/");

/** What a view's `cad_sync` says it shows; null for any other call, or a view on its home. */
export function readViewSync(call: {
  readonly pluginId: string;
  readonly server: string;
  readonly name: string;
  readonly arguments: unknown;
  readonly result: unknown;
}): ShownView | null {
  if (call.name !== "cad_sync" || !isRecord(call.arguments)) return null;
  const { model, state, closed } = call.arguments;
  if (closed === true || typeof model !== "string" || model.length === 0) return null;
  const reply = isRecord(call.result) ? call.result.structuredContent : null;
  const catalog = isRecord(reply) && isRecord(reply.catalog) ? reply.catalog : null;
  const viewRevision = isRecord(state) ? state.revision : undefined;
  const previews = isRecord(reply) && Array.isArray(reply.previews) ? reply.previews : [];
  const preview = previews.find(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) && typeof entry.file === "string" && samePath(entry.file, model),
  );
  return {
    pluginId: call.pluginId,
    server: call.server,
    path: model,
    revision:
      typeof catalog?.revision === "string"
        ? catalog.revision
        : typeof viewRevision === "string" || typeof viewRevision === "number"
          ? String(viewRevision)
          : "",
    preview: preview ?? null,
  };
}

/** The names of the materials a catalog row's model sidecar declares (`appearance.materials`). */
export function readMaterials(entry: unknown): string[] {
  if (!isRecord(entry) || !isRecord(entry.sourceSidecar)) return [];
  const appearance = entry.sourceSidecar.appearance;
  if (!isRecord(appearance) || !isRecord(appearance.materials)) return [];
  const names = new Set<string>();
  for (const material of Object.values(appearance.materials)) {
    if (isRecord(material) && typeof material.name === "string" && material.name.trim() !== "") {
      names.add(material.name.trim());
    }
  }
  return [...names];
}

/** The catalog row's `kind` (`part` or `assembly` for a STEP). */
export function readCatalogKind(catalog: unknown): string | null {
  const entry = readCatalogEntry(catalog);
  return entry !== null && typeof entry.kind === "string" ? entry.kind : null;
}

export function readCatalogEntry(catalog: unknown): Record<string, unknown> | null {
  if (!isRecord(catalog) || !Array.isArray(catalog.entries)) return null;
  const entry = catalog.entries[0];
  return isRecord(entry) ? entry : null;
}

/** When the library last saw the file change (`/__cad/recents`, seconds), as epoch milliseconds. */
export function readModified(recents: unknown, path: string): number | null {
  const list = isRecord(recents) && Array.isArray(recents.recents) ? recents.recents : [];
  for (const recent of list) {
    if (!isRecord(recent) || recent.path !== path) continue;
    return typeof recent.modified === "number" ? recent.modified * 1000 : null;
  }
  return null;
}

/**
 * The last build, from the build feed (a STEP's, as the view's sync carries it)
 * and the file's own time: a build in flight or failed is the news; a build
 * the file has moved past (`superseded`) is not, and the file's time stands.
 */
export function readBuild(preview: unknown, modified: number | null): PartBuild | null {
  if (isRecord(preview) && preview.superseded !== true) {
    const state = typeof preview.state === "string" ? preview.state : "disconnected";
    const updatedAt = typeof preview.updatedAt === "number" ? preview.updatedAt : null;
    if (state === "failed") {
      return { state: "failed", error: typeof preview.error === "string" ? preview.error : null };
    }
    if (state === "done" || state === "current") {
      if (updatedAt !== null && updatedAt > 0) return { state: "built", at: updatedAt };
    } else if (state !== "disconnected") {
      return { state: "building" };
    }
  }
  return modified === null ? null : { state: "saved", at: modified };
}

/** A `cad_http` reply's JSON body: base64, gzipped when large (`encoding: "gzip"`). */
export async function readTunnelJson(result: unknown): Promise<unknown> {
  const reply = isRecord(result) ? result.structuredContent : null;
  if (!isRecord(reply) || reply.status !== 200 || typeof reply.body !== "string") return null;
  const binary = atob(reply.body);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const text =
    reply.encoding === "gzip"
      ? await new Response(
          new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
        ).text()
      : new TextDecoder().decode(bytes);
  return JSON.parse(text) as unknown;
}
