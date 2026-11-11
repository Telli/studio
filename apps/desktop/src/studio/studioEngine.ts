// @effect-diagnostics nodeBuiltinImport:off
// Read by boot.ts (through studioAppBundle.ts) before any Effect runtime exists, and by
// scripts/studio.ts, so it stays on Node built-ins.
import * as NodePath from "node:path";

/**
 * Studio's CAD engine's port: the packaged app's, and a checkout's (every `scripts/studio.ts` run)
 * one past it. Both are outside the ports a user's own CAD server rolls
 * through from its 3245 (64 past it), so neither engine ever lands on the other's port, where the
 * one starting would retire the one idle there.
 */
export const STUDIO_ENGINE_PORT = 3345;
export const STUDIO_DEV_ENGINE_PORT = 3346;

/**
 * Where Studio's bundled CAD server keeps everything, under Studio's own home (`~/.text-to-cad-studio`,
 * or `-dev` for a checkout), never the user's own CAD server's:
 *
 * - `CAD_STATE_DIR`: its registry of documents (Recents), its installation's record and the
 *   page token;
 * - `CAD_CACHE_DIR`: its built documents;
 * - `CAD_ENGINE_DIR`: its server's door, lock and port file, so a user's own CAD server (Claude
 *   Code's or Codex's plugin, on 3245) is never found by Studio's to retire, nor finds it;
 * - `CAD_ENGINE_PORT`: its own port (`STUDIO_ENGINE_PORT`);
 * - `CAD_LAUNCHER_DIR`: where its `cad` command is written (`<home>/bin`), which its agents'
 *   skills run (`studioPath` puts it first on their PATH);
 * - `CAD_INSTALL_CHANNEL`: `dev`, which keeps the CAD tools' update notices and telemetry off from
 *   the very first `cad` command, before any MCP session has written the channel down;
 * - `CAD_API_URL`: in a build with Studio's usage receiver, that receiver's `/v1/cad`, where the CAD
 *   tools send their own counts once Studio's switch turns them on (the server's `CadToolsUsage`);
 *   in any other build `CAD_TELEMETRY=0` instead, so no `cad` that Studio starts ever sends them.
 *
 * The folder is `cad`, not 0.8's `cadgen`: a 0.8 installation's record never stands for 0.10's.
 * The agents Studio runs inherit these, so every `cad` they run is Studio's installation on
 * Studio's server.
 */
export function studioEngineEnv(
  home: string,
  options: { readonly dev: boolean; readonly usageUrl?: string | undefined },
) {
  const cad = NodePath.join(home, "cad");
  const usageUrl = options.usageUrl?.trim().replace(/\/+$/, "") ?? "";
  return {
    CAD_STATE_DIR: NodePath.join(cad, "state"),
    CAD_CACHE_DIR: NodePath.join(cad, "cache"),
    CAD_ENGINE_DIR: NodePath.join(cad, "engine"),
    CAD_ENGINE_PORT: String(options.dev ? STUDIO_DEV_ENGINE_PORT : STUDIO_ENGINE_PORT),
    CAD_LAUNCHER_DIR: NodePath.join(home, "bin"),
    CAD_INSTALL_CHANNEL: "dev",
    ...(usageUrl === "" ? { CAD_TELEMETRY: "0" } : { CAD_API_URL: `${usageUrl}/v1/cad` }),
  };
}

/**
 * A checkout's Studio's (`scripts/studio.ts`, every mode): its CAD server in the checkout's home,
 * `~/.text-to-cad-studio-dev` unless `TEXT_TO_CAD_STUDIO_HOME` moves it, on the checkout's port, so a
 * Studio run from a checkout never shares an engine with the packaged app.
 */
export function checkoutEngineEnv(
  env: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
) {
  const home =
    env.TEXT_TO_CAD_STUDIO_HOME?.trim() || NodePath.join(homeDirectory, ".text-to-cad-studio-dev");
  return studioEngineEnv(home, { dev: true });
}

/** `PATH` with Studio's `cad` command's folder first, once. */
export function studioPath(launcherDir: string, path: string | undefined): string {
  const rest = (path ?? "").split(NodePath.delimiter).filter((entry) => entry !== launcherDir);
  return [launcherDir, ...rest].filter((entry) => entry !== "").join(NodePath.delimiter);
}
