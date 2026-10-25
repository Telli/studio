import type { TessellationCache } from '../lib/surf/cacheTypes.js';
export type { TessellationCache, TessellationCacheEntry, TessellationCacheProvider, TessellatedComponent, TessellationOptions } from '../lib/surf/cacheTypes.js';
export type CadJson = null | boolean | number | string | CadJson[] | { [key: string]: CadJson };
export interface CadEntry {
  /** The file's absolute path, `/`-separated. */
  file: string;
  kind?: string;
  format?: string;
  sourceFormat?: string;
  renderFormat?: string;
  url?: string;
  hash?: string;
  bytes?: number;
  [key: string]: unknown;
}
export interface CadServerInfo {
  autoReload?: boolean;
  identityToken?: string;
  /** The folder the server was started in, where a developer's relative `?file=` resolves. */
  start?: string;
  /** Whether this computer has a file chooser for the home's Open. */
  pick?: boolean;
  /** `darwin`, `win32` or `linux`: which file manager Reveal opens. */
  platform?: string;
  [key: string]: unknown;
}
/** A model in the library every CAD view shares (`GET /__cad/recents`): times in seconds. */
export interface CadRecent {
  path: string; name: string; folder: string; opened: number;
  /** When the file last changed; null once it is gone. */
  modified: number | null;
  pinned: boolean; missing: boolean;
  /** The picture's name, for `thumbnail()`, and when it was taken. */
  thumbnail: string | null; pictured: number | null;
}
/** Whether the person's usage stats are sent (`/__cad/analytics`; nothing asks): `reason` says who decided. */
export interface CadConsent { sharing: boolean; reason: 'default' | 'untold' | 'choice' | 'environment' | 'unavailable'; policy: string }
/** A newer text-to-cad, as cadgen's version check says it (`/__cad/version`). */
export interface CadUpdateNotice { latest: string; version: string; text: string; prompt: string; instructions: string }
export interface CadCatalog { entries: CadEntry[]; [key: string]: unknown }
/** One folder's subfolders and CAD files (`GET /__cad/folder`). */
export interface CadFolder { path: string; entries: { name: string; kind: 'directory' | 'file' }[]; truncated: boolean }
/** The CAD files nested under a folder whose path below it holds the query (`GET /__cad/search`). */
export interface CadSearch { path: string; results: string[]; truncated: boolean }
export interface CadCatalogSnapshot {
  entries: CadEntry[];
  revision: number;
  hydrated: boolean;
  refreshing: boolean;
  error: string;
  /** The server's digest of the last catalog applied ('' before one is): what a change watcher compares. */
  catalogRevision: string;
}
export interface CadRequestOptions { signal?: AbortSignal }
export interface CadArtifactResult {
  ok?: boolean;
  state: 'compiled' | 'not-compiled' | 'compiling' | 'failed';
  error?: string;
  [key: string]: unknown;
}
/**
 * What `GET /__cad/drawing` answers: a drawing's modelspace, flattened to the
 * five primitive shapes ezdxf reduces every entity to and its text, placed, in
 * DXF coordinates with y UP. `color: null` is the default pen, painted with the
 * theme's foreground; `bounds: null` is a drawing with nothing in it. See
 * `apps/web/docs/backend.md`.
 */
export interface CadDrawingPayload {
  schemaVersion: number;
  units: { insunits: number; name: string; toMillimetres: number };
  bounds: [number, number, number, number] | null;
  layers: { name: string; color: string | null; count: number }[];
  /** The faces `text` primitives are set in, which a `text` names by index. */
  fonts: { family: string; weight: number; italic: boolean }[];
  primitives: ({
    type: 'point' | 'lines' | 'path' | 'filled-paths' | 'filled-polygon';
    layer: string;
    color: string | null;
    geometry: unknown;
  } | {
    type: 'text';
    layer: string;
    color: string | null;
    text: string;
    font: number;
    /** Cap height, and the advance width the server measured, in the string's own units. */
    height: number;
    width: number;
    /** `[a, b, c, d, e, f]`: the string's space (baseline-left at the origin, y up) to the drawing's. */
    transform: [number, number, number, number, number, number];
  })[];
  [key: string]: unknown;
}
/**
 * What `GET /__cad/plot` answers: a KiCad board drawn from its file, as geometry per layer
 * (`@text-to-cad/core` `docs/plot-payload.md`). One sheet in millimetres, y DOWN, its top-left
 * corner the origin, drawn on its `background`; its `layers` back to front, each a list of
 * items. `kind` names what it draws, for wording only.
 */
export interface CadPlotPayload {
  schemaVersion: number;
  kind: string;
  /** What wrote the file (`"pcbnew 10.99"`), for wording only. */
  generator?: string;
  /** The board's connections still to make, each drawn as a ratsnest line. */
  unrouted: number | null;
  sheets: { name: string; width: number; height: number; background: string; layers: { id: string; kind: string; side: string; items: Record<string, unknown>[] }[] }[];
  /** The board's index, in sheet millimetres: what the board view's tools point with. */
  board?: Record<string, unknown>;
  [key: string]: unknown;
}
/** Byte tickets own their buffer exclusively: workers may detach it. URL tickets are approved by the provider. */
export type CadWorkerResourceTicket =
  | { kind: 'url'; url: string; headers?: Record<string, string>; cache?: RequestCache; maxBytes?: number }
  | { kind: 'bytes'; bytes: ArrayBuffer };
export interface CadResourceReadOptions extends CadRequestOptions { maxBytes?: number }
export interface CadResourceProvider {
  /** Main-thread lifetime of the current resource generation; issued worker requests observe it too. */
  readonly signal?: AbortSignal;
  /** Stable within one immutable authorization/generation scope; change it when that scope changes. */
  cacheKey?(url: string): string;
  readJson(url: string, options?: CadRequestOptions): Promise<unknown>;
  readText(url: string, options?: CadRequestOptions): Promise<string>;
  readBytes(url: string, options?: CadResourceReadOptions): Promise<ArrayBuffer>;
  byteLength(url: string, options?: CadRequestOptions): Promise<number | null>;
  resolveDependency(source: string, reference: string, options?: { kind?: 'relative' | 'package' | 'robot' }): string;
  workerTicket(url: string, options?: CadResourceReadOptions): Promise<CadWorkerResourceTicket>;
}
export interface CadSurfaceProducer { scheme?: number; surfFormat?: number; producerKey?: string; [key: string]: unknown }
export interface CadRuntimeView {
  tree: string;
  viewId: string;
  surfaceProducer: CadSurfaceProducer;
  components?: Record<string, {surfaceInput: string; surfaceObject?: string; [key: string]: unknown}>;
  [key: string]: unknown;
}
export interface CadSurfaceComponentRequest { cid: string; surfaceInput: string; surfaceObject?: string }
export interface CadSurfaceTicket { readonly surfaceInput: string; readonly surfaceObject: string; readonly surfUrl: string; readonly byteLength: number }
export interface CadSurfaceRequest {
  tree: string; viewId: string; producer: CadSurfaceProducer;
  components: {cid: string; surfaceInput: string; expectedSurfaceObject?: string}[];
  job?: string;
}
export interface CadSurfaceResponse {
  viewId: string; job?: string; replacementView?: CadRuntimeView;
  components: Record<string, {state: 'pending' | 'ready' | 'failed'; surfaceInput: string; surfaceObject?: string; url?: string; byteLength?: number; job?: string; error?: string; code?: string}>;
}
/** What a build of a STEP file is doing: status only. The viewer always shows the saved file. */
export interface CadEditingPreview {
  feedCursor?: string;
  feedLimited?: boolean;
  epoch?: string;
  revision?: number;
  state?: string;
  phase?: string;
  detail?: string;
  updatedAt?: number;
  error?: string;
  output?: string;
  file?: string;
  /** The file changed after this build finished: its failure is no longer the news. */
  superseded?: boolean;
}
export interface CadPreviewObserverOptions {
  schedule?: typeof globalThis.setTimeout;
  cancel?: typeof globalThis.clearTimeout;
}
export interface CadRenderSession {
  resources: CadResourceProvider;
  tessellationCache: TessellationCache;
  signal: AbortSignal;
  dispose(): void;
}
/** Domain service consumed by renderers; HTTP metadata stays on its adapter. */
export interface CadWorkspaceService {
  getSnapshot(): CadCatalogSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(options?: CadRequestOptions & {file?: string;markRefreshing?: boolean}): Promise<CadCatalog>;
  resolveEntry(path: string, options?: CadRequestOptions): Promise<CadEntry>;
  serverInfo(options?: CadRequestOptions & { fresh?: boolean }): Promise<CadServerInfo>;
  folder(path: string, options?: CadRequestOptions): Promise<CadFolder>;
  search(path: string, query: string, options?: CadRequestOptions): Promise<CadSearch>;
  /** The home's library, newest first. */
  recents(options?: CadRequestOptions): Promise<CadRecent[]>;
  /** A change to the library (`open`, `pin`, `unpin`, `remove`, `thumbnail`): the library as it now is. */
  changeRecents(change: { action: 'open' | 'pin' | 'unpin' | 'remove' | 'thumbnail'; path: string; png?: string }): Promise<CadRecent[]>;
  /** Keep a model's picture in the library. */
  keepThumbnail(png: Blob, path: string): Promise<CadRecent[]>;
  /** A library picture, by the name the library gives it, as a data URL; null when there is none. */
  thumbnail(name: string, options?: CadRequestOptions): Promise<string | null>;
  /** Open: the model the person picks with the desktop's chooser, by its absolute path, or null. */
  pick(): Promise<string | null>;
  /** Show a file, by its absolute path, in the desktop's file manager. */
  reveal(path: string): Promise<void>;
  /** Whether the person's usage stats are sent; with `share`, their answer (the app menu's toggle). */
  consent(share?: boolean): Promise<CadConsent>;
  /** The features the person can turn off, as they left them; with `change`, their change of some. */
  features(change?: Record<string, boolean>): Promise<Record<string, boolean>>;
  /** The language the person chose for every CAD view, or null (Automatic); with `locale`, their choice (null clears it). */
  language(locale?: string | null): Promise<{ locale: string | null }>;
  /** Whether a newer text-to-cad is out: the update button's notice, or null. */
  version(): Promise<{ notice: CadUpdateNotice | null }>;
  /**
   * What the page did -- a person touched it, sent a Quick Edit, or the page crashed (`crashOf`) --
   * noted by the server and sent only with consent. Never fails.
   */
  reportActivity(activity: CadActivity): void;
  requestArtifactStatus(file: string, options?: CadRequestOptions): Promise<CadArtifactResult>;
  requestArtifact(file: string, options?: CadRequestOptions & {force?: boolean}): Promise<CadArtifactResult>;
  /** A `.dxf` flattened to 2D render primitives on the server; the client never parses DXF. */
  drawing(file: string, options?: CadRequestOptions): Promise<CadDrawingPayload>;
  /** A KiCad board drawn from its file on the server: geometry per layer, and the board's index. */
  plotPayload(file: string, options?: CadRequestOptions): Promise<CadPlotPayload>;
  readonly resources: CadResourceProvider;
  /** `onReady` hears each component as soon as its row is ready, while the rest are still awaited. */
  resolveSurfaceComponents(view: CadRuntimeView, requested: CadSurfaceComponentRequest[],
    options?: CadRequestOptions & { onReady?: (cid: string, ticket: CadSurfaceTicket) => void }): Promise<Map<string, CadSurfaceTicket>>;
  observeEditingPreview(file: string, onUpdate: (preview: CadEditingPreview) => void, onError: (error: unknown) => void, options?: CadPreviewObserverOptions): () => void;
  createRenderSession(options?: { file?: string }): CadRenderSession;
  dispose(): void;
}
/** Reusable HTTP implementation, also used by existing catalog adapters. */
/** A number in a part's source, as edit mode shows it: a named size, or a feature's input. */
export interface CadEditValue {
  label?: string;
  name?: string | null;
  value: number;
  display?: string;
  text?: string;
  unit?: string;
  formula?: string;
  leaves?: string[];
  length?: boolean;
  id?: string;
  file?: string;
  line?: number;
}

/** A dimension of a feature, drawn on the model in its own millimetres. */
export interface CadEditDimension {
  id: string;
  name: string;
  label: string;
  display: string;
  formula: string;
  leaves: string[];
  row: string | null;
  anchor: [number, number, number];
  lines: [number, number, number][][];
}

/** One feature of a part's history: an operation of its script, at the line that asked for it. */
export interface CadEditRow {
  key: string;
  name: string | null;
  kind: string;
  code?: string;
  file?: string;
  line?: number;
  count?: number;
  inputs: CadEditValue[];
}

export interface CadEditState {
  ok: boolean;
  unchanged?: boolean;
  /** A probe's answer: whether the file has a part script to edit. */
  editable?: boolean;
  reason?: 'no-script';
  error?: string;
  /**
   * Where a part's script stopped (`ok: false`): the frames of the error's traceback that lie in the
   * project's own files, the deepest first and at most six, each named as a row of `rows` names its
   * place, with the line as written. The deepest is the line that raised; when that is in a helper, the
   * next is the call the feature's row stands at. Null when no frame is the project's (a script that does
   * not parse).
   */
  failure?: { frames: { file: string; line: number; text: string }[] } | null;
  script?: string;
  /** Where the part's project starts, as an absolute path: what `files` and each row's `file` are named from. */
  root?: string;
  name?: string;
  units?: 'mm' | 'in';
  files?: Record<string, string>;
  params?: (CadEditValue & { id: string; name: string; text: string })[];
  rows?: CadEditRow[];
  /**
   * Which feature made each face (`cadgen/edit/face_features.py`): a face's number on the part, as its selector has it ("12" for
   * `f12`), → the key of the feature that made it. Only the faces the engine knows; `{}` for an assembly.
   */
  faceFeatures?: Record<string, string>;
  /** How many faces the part read has, for a view to check the faces on screen are that part's before naming one by `faceFeatures`. */
  faceCount?: number;
  /**
   * Who made each feature (`cadgen/edit/authors.py`), by its key: "you" when a hand edit wrote the first line of its
   * statement, "agent" when a turn's checkpoint holds it. A feature from before Studio kept track, or one a turn still
   * running made, has no entry. An unchanged read says it again, as it moves on when a turn ends.
   */
  authors?: Record<string, 'you' | 'agent'>;
  dimensions?: CadEditDimension[];
  choose?: { id: string; name: string; file: string; line: number }[];
  change?: { literal: string; name: string; file: string; line: number; from: string; to: string };
  building?: { scripts: string[]; done: number; error: string | null };
  /** A preview's answer: what the command would add and take away, or why it cannot be made. */
  preview?: { added?: CadEditPreviewSolid | null; removed?: CadEditPreviewSolid | null; error?: string | null };
}

/**
 * A solid a preview draws over the model, in the part's millimetres: three numbers a corner
 * (`positions`), three corners a triangle (`triangles`), and each edge as the points along it.
 */
export interface CadEditPreviewSolid {
  positions: number[];
  triangles: number[];
  edges: number[][];
}

export interface CadEditChangeRequest {
  file: string;
  files?: Record<string, string>;
  text?: string;
  literal?: string;
  dimension?: string;
  input?: { row: string; index: number };
  leaf?: string;
  /** A modeling command's line (`cadgen/edit/commands.py`), or lines put back by Undo and Redo. */
  command?: Record<string, unknown>;
  /** A modeling command made without writing it, for its panel to draw what OK would make. */
  preview?: Record<string, unknown>;
  splice?: { file: string; hunks: unknown[] };
  /** A sketch mode change (`cadgen/edit/sketching.py`): the sketch's file and line, and what to do to it. */
  sketch?: { file?: string; line?: number; name?: string; op: Record<string, unknown> };
  /** Delete on a feature of the design tree (`cadgen/edit/deleting.py`), by its key and its title. */
  remove?: { feature: string; title?: string };
  /** Suppress (`on`) or Unsuppress on a feature of the design tree (`cadgen/edit/deleting.py`). */
  suppress?: { feature: string; title?: string; on: boolean };
  /** Where the rollback bar is for this change (alone, the change only moves it), and where it goes once made. */
  bar?: CadEditBar | null;
  bar_after?: CadEditBar | null;
}

/** The rollback bar: above the tree item whose first line is `before` (`<file>:<line>`). */
export interface CadEditBar {
  before: string;
}

export interface CadClient extends CadWorkspaceService {
  readonly origin: string;
  requestSurfaces(body: CadSurfaceRequest, options?: CadRequestOptions): Promise<CadSurfaceResponse>;
  cancelSurfaceRequest(body: { job: string }, options?: CadRequestOptions): Promise<{ok?: boolean}>;
  editingPreview(file: string, options?: CadRequestOptions & { after?: string }): Promise<CadEditingPreview>;
  /**
   * Edit mode: the part script behind `file` (the script beside a STEP) read as a design. `files`
   * is the hashes the page read last; when none changed the answer is `{ ok: true, unchanged: true }`.
   */
  editState(file: string, files?: Record<string, string> | null, options?: CadRequestOptions & { probe?: boolean; bar?: CadEditBar | null }): Promise<CadEditState>;
  /** Edit mode: one number of the part's source changed, then the parts that use it built again. */
  editChange(change: CadEditChangeRequest, options?: CadRequestOptions): Promise<CadEditState>;
}
export interface CadClientOptions {
  resources?: CadResourceProvider;
  origin?: string;
  fetch?: typeof globalThis.fetch;
  pollIntervalMs?: number;
  /** Host visibility policy, evaluated at each polling interval. */
  shouldPoll?: () => boolean;
  /**
   * A file's build feed, from a host that already hears it on a call it makes anyway: the
   * client then asks the preview route nothing. Returns the unsubscribe.
   */
  editingPreviewFeed?: (file: string, onUpdate: (preview: CadEditingPreview) => void, onError: (error: unknown) => void) => () => void;
  /**
   * The most bytes one batched read asks for over this client's `fetch`: a host whose channel
   * carries large replies slowly declares a ceiling, and reads that batch (a package's warm
   * tessellation bodies) stay within the lesser of it and the server's own bound
   * (`TESS_BATCH_MAX_BYTES`). Unset, the server's bound alone applies.
   */
  maxBatchBytes?: number;
}

/** A page's crash, as telemetry takes one (`crashOf`): never its message, a value or a URL. */
export interface CadPageCrash {
  where: 'page';
  /** The error's name, such as `TypeError`; `<?>` for one that is no plain name. */
  type: string;
  /** Whether the page went on: an error a view's boundary caught, not one that stopped it. */
  handled: boolean;
  /** Its innermost frames, oldest first: a script file's own name (or `<?>`), a function, a place, and for
   * one of the page's own chunks its debug id, by which PostHog finds the chunk's source map. */
  frames: { file: string; function: string; line: number; column: number; chunk_id?: string }[];
}

/** What `reportActivity` tells the page's server. */
export interface CadActivity {
  touched?: boolean;
  quickEdit?: boolean;
  crash?: CadPageCrash;
}
