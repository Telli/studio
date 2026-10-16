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
 * - offers Studio's own plugins (`studio-plugins/`) beside it: the part editor,
 *   which edits text-to-cad parts by hand in cadgen's Python (the checkout's in
 *   development, else CADGEN_PYTHON), and SolidCraft behind the same editor only
 *   with STUDIO_SOLIDCRAFT=1 (STUDIO_SOLIDCRAFT_APP=1 bridges it to the app);
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

import { buildEditorPage } from "./editor-pages.ts";

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

// Studio's own plugins (studio-plugins/), copied fresh each start with this computer's paths
// written into their MCP configs, so nothing in the repository names a path on one computer.
const own = NodePath.join(home, "studio-plugins");
NodeFS.rmSync(own, { recursive: true, force: true });
NodeFS.cpSync(NodePath.join(appRoot, "studio-plugins"), own, { recursive: true });
const markets = [marketplace];
const defaults = ["text-to-cad"];
const writeConfig = (plugin: string, name: string, args: ReadonlyArray<string>) =>
  NodeFS.writeFileSync(
    NodePath.join(own, plugin, "codex.mcp.json"),
    JSON.stringify({ mcpServers: { [name]: { command: process.execPath, args } } }, null, 2),
  );

// The part editor: a text-to-cad part's sizes and dimensions changed by hand, each change one
// number in its script. It runs the scripts in cadgen's Python: the checkout's in development.
const cadgenPython =
  process.env.CADGEN_PYTHON?.trim() ||
  (dev ? NodePath.join(checkout, ".venv", "bin", "python") : "");
if (cadgenPython !== "" && NodeFS.existsSync(cadgenPython)) {
  await buildEditorPage(
    appRoot,
    NodePath.join(appRoot, "studio-plugins", "part-editor", "editor"),
    NodePath.join(own, "part-editor", "editor", "editor.html"),
  );
  writeConfig("part-editor", "part-editor", [
    NodePath.join(own, "part-editor", "server", "server.mjs"),
    "--python",
    cadgenPython,
  ]);
  defaults.push("part-editor");
}

// SolidCraft (a parametric CAD engine) behind the same editor, only when asked:
// STUDIO_SOLIDCRAFT=1, with it installed in Applications. STUDIO_SOLIDCRAFT_APP=1 bridges its
// engine to the SolidCraft app instead of running it headless.
const SOLIDCRAFT_APP = process.env.SOLIDCRAFT_APP?.trim() || "/Applications/SolidCraft.app";
const SOLIDCRAFT_PORT = "7878";
const bridged = process.env.STUDIO_SOLIDCRAFT_APP?.trim() === "1";
if (process.env.STUDIO_SOLIDCRAFT?.trim() === "1" && NodeFS.existsSync(SOLIDCRAFT_APP)) {
  const projects =
    process.env.STUDIO_PROJECTS_DIR?.trim() || NodePath.join(NodeOS.homedir(), "studio-projects");
  const allowed = [
    projects,
    ...(process.env.SOLIDCRAFT_ALLOW_PATHS?.split(NodePath.delimiter) ?? []),
  ]
    .map((folder) => folder.trim())
    .filter(Boolean);
  await buildEditorPage(
    appRoot,
    NodePath.join(appRoot, "studio-plugins", "solidcraft", "editor"),
    NodePath.join(own, "solidcraft", "editor", "editor.html"),
  );
  writeConfig("solidcraft", "solidcraft", [
    NodePath.join(own, "solidcraft", "server", "server.mjs"),
    "--cli",
    NodePath.join(SOLIDCRAFT_APP, "Contents", "MacOS", "solidcraft-cli"),
    ...(bridged ? ["--connect", `127.0.0.1:${SOLIDCRAFT_PORT}`] : []),
    ...allowed.flatMap((folder) => ["--allow-path", folder]),
  ]);
  defaults.push("solidcraft");
  if (bridged) {
    // Opens SolidCraft beside Studio, ready for the agent; one already open keeps its own window.
    NodeChildProcess.spawn("open", ["-a", SOLIDCRAFT_APP, "--args", "--control", SOLIDCRAFT_PORT], {
      stdio: "ignore",
      detached: true,
    }).unref();
  }
} else {
  // Left out entirely, so its skills never point the agent at tools that are not there.
  NodeFS.rmSync(NodePath.join(own, "solidcraft"), { recursive: true, force: true });
  const listing = NodePath.join(own, ".claude-plugin", "marketplace.json");
  const market = JSON.parse(NodeFS.readFileSync(listing, "utf8"));
  market.plugins = market.plugins.filter(
    (plugin: { name: string }) => plugin.name !== "solidcraft",
  );
  NodeFS.writeFileSync(listing, JSON.stringify(market, null, 2));
}
if (defaults.length > 1) markets.push(own);

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
      T3CODE_PLUGIN_MARKETPLACE: markets.join(NodePath.delimiter),
      T3CODE_DEFAULT_PLUGINS: defaults.join(","),
      VITE_APP_BASE_NAME: brand.name,
      T3CODE_BRAND_DIR: brandDir,
    },
  },
);
process.exit(run.status ?? 1);
