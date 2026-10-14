// @effect-diagnostics nodeBuiltinImport:off - a launcher that only sets the environment and runs the dev runner.
/**
 * Runs this app as text-to-cad Studio: T3 Code with the text-to-cad plugin
 * built in. It lives at `apps/studio` inside a text-to-cad checkout, so
 * `node scripts/studio.ts [dev|dev:desktop]` from here:
 *
 * - reads the checkout as a plugin marketplace and installs and enables its
 *   `text-to-cad` plugin on first start (apps/server/src/plugins/BundledPlugins.ts);
 * - names and brands the app from `brand/` (text-to-cad's mark, icons and accent);
 * - keeps its state in `~/.text-to-cad-studio`, never in T3 Code's own home.
 *
 * TEXT_TO_CAD_ROOT points at another checkout; TEXT_TO_CAD_STUDIO_HOME moves the state.
 * TEXT_TO_CAD_DEV=1 runs the checkout's working copy instead of the released cadgen: its
 * development plugin (scripts/studio-dev-plugin.py), with state of its own in
 * `~/.text-to-cad-studio-dev`, so it never mixes with a release's installs.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const appRoot = NodePath.dirname(import.meta.dirname);
const checkout = NodePath.resolve(
  process.env.TEXT_TO_CAD_ROOT?.trim() || NodePath.join(appRoot, "..", ".."),
);
if (!NodeFS.existsSync(NodePath.join(checkout, ".claude-plugin", "marketplace.json"))) {
  process.stderr.write(
    `No text-to-cad checkout at ${checkout}. Run Studio from apps/studio in text-to-cad, or set TEXT_TO_CAD_ROOT.\n`,
  );
  process.exit(1);
}

const mode = process.argv[2] ?? "dev";
if (mode !== "dev" && mode !== "dev:desktop") {
  process.stderr.write(`Usage: node scripts/studio.ts [dev|dev:desktop]\n`);
  process.exit(1);
}
const dev = process.env.TEXT_TO_CAD_DEV?.trim() === "1";
// The checkout's development plugin: its skills and server on its .venv, its page built fresh.
let marketplace = checkout;
if (dev) {
  process.stderr.write(`Building the development plugin from ${checkout}...\n`);
  const built = NodeChildProcess.spawnSync(
    "python3",
    [NodePath.join(appRoot, "scripts", "studio-dev-plugin.py"), checkout],
    {
      cwd: appRoot,
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const folder = built.stdout.trim().split("\n").at(-1) ?? "";
  if (built.status !== 0 || folder === "") process.exit(built.status || 1);
  marketplace = folder;
}
const home =
  process.env.TEXT_TO_CAD_STUDIO_HOME?.trim() ||
  NodePath.join(NodeOS.homedir(), dev ? ".text-to-cad-studio-dev" : ".text-to-cad-studio");
// text-to-cad's name, mark, icons and accent (brand/README.md).
const brandDir = NodePath.join(appRoot, "brand");
const brand = JSON.parse(NodeFS.readFileSync(NodePath.join(brandDir, "brand.json"), "utf8"));

const run = NodeChildProcess.spawnSync(
  process.execPath,
  [
    NodePath.join(appRoot, "scripts", "dev-runner.ts"),
    mode,
    "--home-dir",
    home,
    ...process.argv.slice(3),
  ],
  {
    cwd: appRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      T3CODE_PLUGIN_MARKETPLACE: marketplace,
      T3CODE_DEFAULT_PLUGINS: "text-to-cad",
      VITE_APP_BASE_NAME: brand.name,
      T3CODE_BRAND_DIR: brandDir,
    },
  },
);
process.exit(run.status ?? 1);
