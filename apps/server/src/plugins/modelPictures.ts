// @effect-diagnostics nodeBuiltinImport:off -- renders through the plugin's own CLI and caches PNG files on disk.
/**
 * Pictures of a project's models for Studio's project page: every part,
 * assembly, board, drawing and mesh, not only the ones a viewer has opened.
 * text-to-cad renders them itself: its CAD server is `cadgen mcp`, and the
 * same launcher with `snapshot` instead of `mcp` renders any file it opens
 * (STEP, meshes, DXF, KiCad boards and schematics, harnesses, robots) to a PNG,
 * a whole batch in one run. So a release runs the release's cadgen and a
 * development checkout its own. Pictures are cached by the file's size and
 * time, so a page renders only what changed.
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
const RENDERABLE =
  /\.(?:step|stp|stl|3mf|glb|dxf|kicad_pcb|kicad_sch|urdf|srdf|sdf)$|\.harness\.ya?ml$/i;

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

/** Where a file's picture is cached: named by the file and its size and time, so an edit is a new picture. */
export function pictureFile(cacheDir: string, absolute: string, stat: NodeFS.Stats): string {
  const key = NodeCrypto.createHash("sha256")
    .update(`${absolute}\n${stat.size}\n${stat.mtimeMs}`)
    .digest("hex")
    .slice(0, 32);
  return NodePath.join(cacheDir, `${key}.png`);
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

/**
 * The pictures of `paths` (workspace-relative) under `cwd`, as base64 PNGs,
 * null for a file that is gone or would not render. Cached ones come back at
 * once; the rest render in one batch, and a batch that fails renders one by
 * one, so one broken file costs only its own picture.
 */
export async function renderModelPictures(input: {
  readonly launch: SnapshotLaunch;
  readonly cwd: string;
  readonly paths: ReadonlyArray<string>;
  readonly cacheDir: string;
}): Promise<Array<{ readonly path: string; readonly png: string | null }>> {
  const previous = running.get(input.cwd) ?? Promise.resolve();
  const turn = previous.catch(() => undefined).then(() => render(input));
  running.set(input.cwd, turn);
  try {
    return await turn;
  } finally {
    if (running.get(input.cwd) === turn) running.delete(input.cwd);
  }
}

async function render(input: {
  readonly launch: SnapshotLaunch;
  readonly cwd: string;
  readonly paths: ReadonlyArray<string>;
  readonly cacheDir: string;
}) {
  NodeFS.mkdirSync(input.cacheDir, { recursive: true });
  const root = NodePath.resolve(input.cwd);
  const files = input.paths.map((path) => {
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
