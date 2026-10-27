// @effect-diagnostics nodeBuiltinImport:off
// Read by boot.ts (through studioAppBundle.ts) before any Effect runtime exists, and by
// scripts/studio.ts, so it stays on Node built-ins.
import * as NodePath from "node:path";

/**
 * Studio's CAD engine's port: the packaged app's, and a checkout's (`TEXT_TO_CAD_DEV=1`, or any
 * `scripts/studio.ts` run) one past it. Both are outside the ports a user's own cadgen rolls
 * through from its 3245 (64 past it), so neither engine ever lands on the other's port, where the
 * one starting would retire the one idle there.
 */
export const STUDIO_ENGINE_PORT = 3345;
export const STUDIO_DEV_ENGINE_PORT = 3346;

/**
 * Where Studio's bundled cadgen keeps everything, under Studio's own home (`~/.text-to-cad-studio`,
 * or `-dev` for a checkout), never the user's own cadgen's:
 *
 * - `CADGEN_STATE_DIR`: its registry of documents (Recents), its installation's record and the
 *   page token;
 * - `CADGEN_CACHE_DIR`: its built documents;
 * - `CADGEN_ENGINE_DIR`: its engine's door, lock and port file, so a user's own cadgen 0.8 engine
 *   (Claude Code's or Codex's plugin, on 3245) is never found by Studio's to retire, nor finds it;
 * - `CADGEN_ENGINE_PORT`: its own port (`STUDIO_ENGINE_PORT`);
 * - `CADGEN_LAUNCHER_DIR`: where its `cadgen` command is written (`<home>/bin`), which its agents'
 *   skills run as `cadgen +<version>` (`studioPath` puts it first on their PATH).
 *
 * The agents Studio runs inherit these, so every `cadgen` they run is Studio's installation on
 * Studio's engine.
 */
export function studioEngineEnv(home: string, options: { readonly dev: boolean }) {
  const cadgen = NodePath.join(home, "cadgen");
  return {
    CADGEN_STATE_DIR: NodePath.join(cadgen, "state"),
    CADGEN_CACHE_DIR: NodePath.join(cadgen, "cache"),
    CADGEN_ENGINE_DIR: NodePath.join(cadgen, "engine"),
    CADGEN_ENGINE_PORT: String(options.dev ? STUDIO_DEV_ENGINE_PORT : STUDIO_ENGINE_PORT),
    CADGEN_LAUNCHER_DIR: NodePath.join(home, "bin"),
  };
}

/** `PATH` with Studio's `cadgen` command's folder first, once. */
export function studioPath(launcherDir: string, path: string | undefined): string {
  const rest = (path ?? "").split(NodePath.delimiter).filter((entry) => entry !== launcherDir);
  return [launcherDir, ...rest].filter((entry) => entry !== "").join(NodePath.delimiter);
}
