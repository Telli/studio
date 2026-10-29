// @effect-diagnostics nodeBuiltinImport:off -- renders through the plugin's own CLI and caches PNG files on disk.
/**
 * Pictures of a project's models for Studio's project page: every part,
 * assembly, board, drawing and mesh, not only the ones a viewer has opened.
 * text-to-cad renders them itself: its CAD server is `cadgen mcp`, and the
 * same launcher with `snapshot` instead of `mcp` renders any document or file
 * it opens (a model by its document id, STEP, xbf, meshes, DXF, robots) to a
 * PNG, a whole batch in one run. So a release runs the release's cadgen and a
 * development checkout its own. Pictures are cached by the file's size and
 * time, or by a model's build, so a page renders only what changed. KiCad
 * boards and wiring harnesses have no picture on cadgen 0.8.
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

/** The files cadgen renders, by ending. */
const RENDERABLE = /\.(?:step|stp|xbf|stl|3mf|glb|dxf|urdf|srdf|sdf)$/i;

/** A cadgen document id: a model's, which its script's run prints (cadgen's `ids.is_id`). */
const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface SnapshotLaunch {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
}

/**
 * The command that renders pictures, from a plugin's CAD server: the server's
 * own launcher with its trailing `mcp` turned into `snapshot`. Null for a
 * server that is not cadgen's.
 */
export function snapshotLaunch(
  plugin: { readonly root: string; readonly servers: Readonly<Record<string, PluginServerConfig>> },
  environment: Readonly<Record<string, string | undefined>>,
): SnapshotLaunch | null {
  for (const config of Object.values(plugin.servers)) {
    if (config.command === null || config.args.at(-1) !== "mcp") continue;
    const before = config.args.at(-2) ?? "";
    // `uvx … cadgen mcp`, or a checkout's `python -m cadgen.cli mcp`.
    if (!/(?:^|[\\/])cadgen(?:\.cli)?$/.test(before)) continue;
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(environment))
      if (value !== undefined) env[key] = value;
    for (const [key, value] of Object.entries(config.env))
      env[key] = expandPluginRoot(value, plugin.root);
    env.PLUGIN_ROOT = plugin.root;
    env.CLAUDE_PLUGIN_ROOT = plugin.root;
    return {
      command: expandPluginRoot(config.command, plugin.root),
      args: [
        ...config.args.slice(0, -1).map((arg) => expandPluginRoot(arg, plugin.root)),
        "snapshot",
      ],
      env,
      cwd: plugin.root,
    };
  }
  return null;
}

export const isRenderable = (path: string) => RENDERABLE.test(path);

/** Where a picture is cached: named by what it shows, so an edit or a build is a new picture. */
const cached = (cacheDir: string, key: string) =>
  NodePath.join(
    cacheDir,
    `${NodeCrypto.createHash("sha256").update(key).digest("hex").slice(0, 32)}.png`,
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
    output: { padding: 0.08 },
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
