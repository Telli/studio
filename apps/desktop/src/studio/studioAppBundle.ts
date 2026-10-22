// @effect-diagnostics nodeBuiltinImport:off
// Runs from boot.ts before any Effect runtime exists, so it stays on Node built-ins.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/**
 * The Studio app (`scripts/build-studio-app.sh`) carries a bundle in `Contents/Resources/studio`:
 * the CAD tools with a Python of their own, their plugin laid out as a marketplace, the plugin's
 * page, and the settings the app starts with (`studio.json`). On each start, before anything reads
 * the environment, this points the app at that bundle, as `scripts/studio.ts` does for a checkout:
 *
 * - Studio's own home (`T3CODE_HOME`) and Electron profile (`T3CODE_DESKTOP_PROFILE`), apart from
 *   T3 Code's `~/.t3`, so the two apps never share state or a single-instance lock.
 * - Its name (`VITE_APP_BASE_NAME`), which the desktop and the server read at runtime.
 * - The CAD plugin, copied into the home with this copy of the app's paths filled in (the app can
 *   live anywhere), then offered and turned on (`T3CODE_PLUGIN_MARKETPLACE`,
 *   `T3CODE_DEFAULT_PLUGINS`).
 * - The Node that cadgen's mesh and DXF builders run on (`CADGEN_NODE`): Playwright's, inside the
 *   bundled Python, so the Mac needs no Node of its own. The agent's commands inherit it.
 *
 * Anything already set in the environment wins, so a test can point the app elsewhere. Without a
 * bundle (T3 Code, or Studio run from a checkout) it does nothing.
 */
export function applyStudioAppBundle(input: {
  readonly resourcesPath: string | undefined;
  readonly homeDirectory: string;
  readonly env: Record<string, string | undefined>;
}): void {
  if (input.resourcesPath === undefined || input.resourcesPath === "") return;
  const bundle = NodePath.join(input.resourcesPath, "studio");
  const settings = readSettings(NodePath.join(bundle, "studio.json"));
  if (settings === null) return;
  const { env } = input;
  const home = env.T3CODE_HOME?.trim() || NodePath.join(input.homeDirectory, settings.home);
  const python = NodePath.join(bundle, "python", "bin", "python3");
  const node = NodePath.join(
    bundle,
    "python",
    "lib",
    "python3.13",
    "site-packages",
    "playwright",
    "driver",
    "node",
  );
  setDefault(env, "T3CODE_HOME", home);
  setDefault(env, "VITE_APP_BASE_NAME", settings.name);
  setDefault(env, "T3CODE_DESKTOP_PROFILE", settings.profile);
  setDefault(env, "T3CODE_DEFAULT_PLUGINS", settings.plugins.join(","));
  setDefault(env, "CADGEN_NODE", node);
  try {
    trustBundledTools(bundle);
    // A folder of Studio's own name: T3 Code's plugin store keys a marketplace by its folder name.
    const marketplace = NodePath.join(home, "studio-app-plugins");
    writeFilledCopy(NodePath.join(bundle, "marketplace"), marketplace, {
      "@@STUDIO_PYTHON@@": python,
      "@@STUDIO_PAGE@@": NodePath.join(bundle, "page"),
      "@@STUDIO_NODE@@": node,
    });
    setDefault(env, "T3CODE_PLUGIN_MARKETPLACE", marketplace);
  } catch (error) {
    // Studio still opens; it just has no CAD tools this time, and says why in its log.
    // @effect-diagnostics-next-line globalConsole:off - Runs before any Effect logger exists.
    console.error("[studio] Could not set up the CAD tools:", error);
  }
}

interface StudioSettings {
  readonly name: string;
  readonly home: string;
  readonly profile: string;
  readonly plugins: ReadonlyArray<string>;
}

function readSettings(file: string): StudioSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(NodeFS.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { name, home, profile, plugins } = parsed as Record<string, unknown>;
  if (typeof name !== "string" || typeof home !== "string" || typeof profile !== "string") {
    return null;
  }
  const names = Array.isArray(plugins)
    ? plugins.filter((plugin) => typeof plugin === "string")
    : [];
  return { name, home, profile, plugins: names };
}

function setDefault(env: Record<string, string | undefined>, name: string, value: string): void {
  if (!env[name]?.trim()) env[name] = value;
}

function filesIn(root: string, folder = ""): string[] {
  return NodeFS.readdirSync(NodePath.join(root, folder), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = NodePath.join(folder, entry.name);
      if (entry.isDirectory()) return filesIn(root, relative);
      return entry.isFile() ? [relative] : [];
    },
  );
}

function filled(content: Buffer, values: Readonly<Record<string, string>>): Buffer {
  if (!content.includes("@@STUDIO_")) return content;
  let text = content.toString("utf8");
  for (const [token, value] of Object.entries(values)) text = text.replaceAll(token, value);
  return Buffer.from(text, "utf8");
}

/**
 * Copies `source` to `target` with the app's paths filled in, writing only what changed and
 * removing what the bundle no longer has, so the plugin's fingerprint (and T3 Code's install of
 * it) moves only when the plugin or the app's place does.
 */
export function writeFilledCopy(
  source: string,
  target: string,
  values: Readonly<Record<string, string>>,
): void {
  const wanted = new Set(filesIn(source));
  for (const file of wanted) {
    const from = NodePath.join(source, file);
    const to = NodePath.join(target, file);
    const content = filled(NodeFS.readFileSync(from), values);
    let current: Buffer | null = null;
    try {
      current = NodeFS.readFileSync(to);
    } catch {
      current = null;
    }
    if (current === null || !current.equals(content)) {
      NodeFS.mkdirSync(NodePath.dirname(to), { recursive: true });
      NodeFS.writeFileSync(to, content);
    }
    NodeFS.chmodSync(to, NodeFS.statSync(from).mode);
  }
  if (!NodeFS.existsSync(target)) return;
  for (const file of filesIn(target)) {
    if (!wanted.has(file)) NodeFS.rmSync(NodePath.join(target, file), { force: true });
  }
}

/**
 * The bundled Python and its libraries came in the same download as Studio, which the person let
 * open (Open Anyway). Clearing the download's quarantine mark from them keeps macOS from stopping
 * each of those programs again on its own. A no-op once cleared, and on a build that was never
 * downloaded.
 */
function trustBundledTools(bundle: string): void {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Runs before any Effect runtime.
  if (process.platform !== "darwin") return;
  const python = NodePath.join(bundle, "python");
  const marked = NodeChildProcess.spawnSync("xattr", ["-p", "com.apple.quarantine", python], {
    stdio: "ignore",
  });
  if (marked.status !== 0) return;
  NodeChildProcess.spawnSync("xattr", ["-dr", "com.apple.quarantine", python], { stdio: "ignore" });
}
