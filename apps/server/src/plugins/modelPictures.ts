// @effect-diagnostics nodeBuiltinImport:off -- renders through the plugin's own CLI and caches PNG files on disk.
/**
 * Pictures of a project's models for Studio's project page: every part,
 * assembly, board, drawing and mesh, not only the ones a viewer has opened.
 * text-to-cad renders them itself: its plugin's MCP server is `cad-mcp`, and
 * the server of the same release, `cad snapshot`, renders any document or file
 * it opens (a model by its document id, STEP, xbf, meshes, DXF, robots) to a
 * PNG, a whole batch in one run. So a release runs the release's server and a
 * development checkout or the Studio app its own Python's. Pictures are cached
 * by the file's size and time, or by a model's build, so a page renders only
 * what changed.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { expandPluginRoot, type PluginServerConfig } from "@t3tools/plugins";

/** How big a picture is: a project page's tile, sharp at twice its size. */
const WIDTH = 480;
const HEIGHT = 360;
/** A batch of cold renders (a kernel warming up) can take this long. */
const RUN_MS = 4 * 60_000;

/** The files the CAD server renders, by ending. */
const RENDERABLE = /\.(?:step|stp|xbf|stl|3mf|glb|dxf|urdf|srdf|sdf)$/i;

/** The files drawn on their own paper. */
const DRAWING = /\.dxf$/i;

/** A CAD document id: a model's, which its script's run prints (the library's `ids.is_id`). */
const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface SnapshotLaunch {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
}

/**
 * The command that renders pictures, from a plugin's CAD server: a release's
 * `uvx … --from cad-mcp==<version> cad-mcp` becomes that release's server's
 * `uvx … --from cad-server==<version> cad snapshot`, and a Python's
 * `python -m cad_mcp` (a checkout's .venv, the Studio app's own) that
 * Python's `-m cad_server.cli snapshot`. Null for a server that is not CAD's.
 */
export function snapshotLaunch(
  plugin: { readonly root: string; readonly servers: Readonly<Record<string, PluginServerConfig>> },
  environment: Readonly<Record<string, string | undefined>>,
): SnapshotLaunch | null {
  for (const config of Object.values(plugin.servers)) {
    if (config.command === null) continue;
    const args = snapshotArgs(config.args);
    if (args === null) continue;
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(environment))
      if (value !== undefined) env[key] = value;
    for (const [key, value] of Object.entries(config.env))
      env[key] = expandPluginRoot(value, plugin.root);
    env.PLUGIN_ROOT = plugin.root;
    env.CLAUDE_PLUGIN_ROOT = plugin.root;
    return {
      command: expandPluginRoot(config.command, plugin.root),
      args: args.map((arg) => expandPluginRoot(arg, plugin.root)),
      env,
      cwd: plugin.root,
    };
  }
  return null;
}

/** The snapshot's arguments for a CAD server's launch arguments; null for another server's. */
function snapshotArgs(args: ReadonlyArray<string>): string[] | null {
  const last = args.at(-1);
  if (last === "cad_mcp" && args.at(-2) === "-m")
    return [...args.slice(0, -2), "-m", "cad_server.cli", "snapshot"];
  if (last !== "cad-mcp") return null;
  const from = args.indexOf("--from");
  const release = from === -1 ? undefined : /^cad-mcp(==.+)$/.exec(args[from + 1] ?? "")?.[1];
  if (release === undefined) return null;
  return [
    ...args.slice(0, from),
    "--from",
    `cad-server${release}`,
    ...args.slice(from + 2, -1),
    "cad",
    "snapshot",
  ];
}

export const isRenderable = (path: string) => RENDERABLE.test(path);

/**
 * How a picture is drawn, in what it is cached by: a picture drawn another way is a new picture,
 * not the old one kept. Now a part on nothing, the tile's own ground in each theme behind it.
 */
const PICTURE_LOOK = "model-alone";

/** Where a picture is cached: named by what it shows, so an edit or a build is a new picture. */
const cached = (cacheDir: string, key: string) =>
  NodePath.join(
    cacheDir,
    `${NodeCrypto.createHash("sha256").update(`${PICTURE_LOOK}\n${key}`).digest("hex").slice(0, 32)}.png`,
  );

/** A file's picture: by the file and its size and time. */
export function pictureFile(cacheDir: string, absolute: string, stat: NodeFS.Stats): string {
  return cached(cacheDir, `${absolute}\n${stat.size}\n${stat.mtimeMs}`);
}

function run(launch: SnapshotLaunch, jobFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(
      launch.command,
      [...launch.args, "--job", jobFile, "--width", String(WIDTH), "--height", String(HEIGHT)],
      {
        cwd: launch.cwd,
        env: launch.env,
        stdio: ["ignore", "ignore", "pipe"],
        timeout: RUN_MS,
        killSignal: "SIGTERM",
      },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split("\n").at(-1) || `snapshot exited with ${code}`));
    });
  });
}

// One render at a time per project: a page that asks again while one runs waits for it.
const running = new Map<string, Promise<unknown>>();

interface PicturesInput {
  readonly launch: SnapshotLaunch;
  readonly cwd: string;
  /** Workspace-relative files, and models by their document id. */
  readonly paths: ReadonlyArray<string>;
  /** Each model's build (its Recents `updated`), by id: what its picture is cached by. */
  readonly versions?: Readonly<Record<string, string>> | undefined;
  readonly cacheDir: string;
}

/**
 * The pictures of `paths` under `cwd`, as base64 PNGs, null for a file that
 * is gone or would not render, and for a model whose build is not named.
 * Cached ones come back at once; the rest render in one batch, and a batch
 * that fails renders one by one, so one broken file costs only its own
 * picture.
 */
export async function renderModelPictures(
  input: PicturesInput,
): Promise<Array<{ readonly path: string; readonly png: string | null }>> {
  const previous = running.get(input.cwd) ?? Promise.resolve();
  const turn = previous.catch(() => undefined).then(() => render(input));
  running.set(input.cwd, turn);
  try {
    return await turn;
  } finally {
    if (running.get(input.cwd) === turn) running.delete(input.cwd);
  }
}

async function render(input: PicturesInput) {
  NodeFS.mkdirSync(input.cacheDir, { recursive: true });
  const root = NodePath.resolve(input.cwd);
  const files = input.paths.map((path) => {
    if (DOCUMENT_ID.test(path)) {
      // The engine draws a model from the document it holds; its build names the picture.
      const version = input.versions?.[path];
      return {
        path,
        absolute: path,
        picture: version === undefined ? null : cached(input.cacheDir, `${path}\n${version}`),
      };
    }
    const absolute = NodePath.resolve(root, path);
    // Workspace files only.
    if (!absolute.startsWith(`${root}${NodePath.sep}`) || !isRenderable(path)) {
      return { path, absolute, picture: null };
    }
    try {
      return {
        path,
        absolute,
        picture: pictureFile(input.cacheDir, absolute, NodeFS.statSync(absolute)),
      };
    } catch {
      return { path, absolute, picture: null };
    }
  });
  const missing = files.filter(
    (file): file is typeof file & { picture: string } =>
      file.picture !== null && !NodeFS.existsSync(file.picture),
  );
  const job = (file: { readonly absolute: string; readonly picture: string }) => ({
    input: file.absolute,
    outputs: [{ path: file.picture }],
    // A part on nothing, the viewer's ground the tile's. A drawing keeps its paper: its dark ink on
    // nothing would be lost on a dark tile.
    output: { padding: 0.08, ...(DRAWING.test(file.absolute) ? {} : { transparent: true }) },
  });
  const runJobs = async (jobs: ReadonlyArray<ReturnType<typeof job>>) => {
    const jobFile = NodePath.join(input.cacheDir, `job-${NodeCrypto.randomUUID()}.json`);
    NodeFS.writeFileSync(jobFile, JSON.stringify(jobs));
    try {
      await run(input.launch, jobFile);
    } finally {
      NodeFS.rmSync(jobFile, { force: true });
    }
  };
  if (missing.length > 0) {
    try {
      await runJobs(missing.map(job));
    } catch {
      for (const file of missing) {
        if (NodeFS.existsSync(file.picture)) continue;
        await runJobs([job(file)]).catch(() => undefined);
      }
    }
  }
  return files.map((file) => {
    if (file.picture === null || !NodeFS.existsSync(file.picture))
      return { path: file.path, png: null };
    return { path: file.path, png: NodeFS.readFileSync(file.picture).toString("base64") };
  });
}
