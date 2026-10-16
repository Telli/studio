/**
 * Plugins an app built on T3 Code ships with. text-to-cad Studio runs this
 * server from inside a text-to-cad checkout and sets:
 *
 * - `T3CODE_PLUGIN_MARKETPLACE`: marketplace folders read in place, beside the
 *   default catalogs (the checkout itself, whose plugin is `./`, and any of the
 *   app's own), separated as PATH separates folders;
 * - `T3CODE_DEFAULT_PLUGINS`: comma-separated plugin names to install and
 *   enable on first start, each from the first of those folders that lists it.
 *
 * Each default is offered once (`plugins/offered.json`), so one the user
 * uninstalls stays uninstalled. Without the variables nothing changes.
 */
import { catalogKey } from "@t3tools/plugins";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as PluginFiles from "./pluginFiles.ts";
import * as PluginService from "./PluginService.ts";
import * as PluginStore from "./PluginStore.ts";

/** The marketplace folders, split as PATH is on this platform. */
const marketplaceFolders = Effect.gen(function* () {
  const value = yield* Config.String("T3CODE_PLUGIN_MARKETPLACE").pipe(Config.withDefault(""));
  const separator = (yield* HostProcess.isWindows) ? ";" : ":";
  return value
    .split(separator)
    .map((folder) => folder.trim())
    .filter((folder) => folder.length > 0);
});

const defaultPluginNames = Config.String("T3CODE_DEFAULT_PLUGINS").pipe(
  Config.map((value) =>
    value
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  ),
  Config.withDefault<ReadonlyArray<string>>([]),
);

/** The plugin names a folder's marketplace lists. */
function listedNames(folder: string): ReadonlyArray<string> {
  const raw = PluginFiles.readJsonFile(`${folder}/.claude-plugin/marketplace.json`);
  const plugins =
    typeof raw === "object" && raw !== null && "plugins" in raw && Array.isArray(raw.plugins)
      ? raw.plugins
      : [];
  return plugins.flatMap((plugin: unknown) =>
    typeof plugin === "object" &&
    plugin !== null &&
    "name" in plugin &&
    typeof plugin.name === "string"
      ? [plugin.name]
      : [],
  );
}

/**
 * The catalog keys of the plugins to offer: each name from the first folder
 * that lists it, else from the first folder (where installing it fails, and is
 * tried again at the next start).
 */
export function defaultPluginKeys(
  folders: ReadonlyArray<string>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return names.flatMap((name) => {
    const folder = folders.find((entry) => listedNames(entry).includes(name)) ?? folders[0];
    return folder === undefined ? [] : [catalogKey(PluginStore.folderMarketplaceId(folder), name)];
  });
}

/** The plugin store over the default catalogs plus the bundled folders. */
export const storeLayer = Layer.unwrap(
  Effect.gen(function* () {
    const folders = yield* marketplaceFolders;
    return PluginStore.layerWith([
      ...PluginStore.DEFAULT_MARKETPLACE_SOURCES,
      ...folders.map((path) => ({ type: "folder" as const, path })),
    ]);
  }),
);

const readOffered = (file: string): Array<string> => {
  const raw = PluginFiles.readJsonFile(file);
  return Array.isArray(raw) ? raw.filter((key): key is string => typeof key === "string") : [];
};

/** Installs and enables each default plugin the user was not offered before. */
export const offerDefaults = Effect.gen(function* () {
  const folders = yield* marketplaceFolders;
  const names = yield* defaultPluginNames;
  if (folders.length === 0 || names.length === 0) return;
  const plugins = yield* PluginService.PluginService;
  const config = yield* ServerConfig.ServerConfig;
  const path = yield* Path.Path;
  const offeredFile = path.join(config.stateDir, "plugins", "offered.json");
  for (const key of defaultPluginKeys(folders, names)) {
    if (readOffered(offeredFile).includes(key)) continue;
    // Recorded only once installed: a failure (an unreadable checkout, a clash with the same
    // plugin from another catalog) is tried again at the next start.
    yield* plugins.install(key).pipe(
      Effect.tap((installed) =>
        installed.enabled ? Effect.void : plugins.setEnabled(installed.id, true),
      ),
      Effect.tap(() =>
        Effect.sync(() =>
          PluginFiles.writeJsonFile(offeredFile, [...readOffered(offeredFile), key]),
        ),
      ),
      Effect.catch((error) =>
        Effect.logWarning("bundled plugin was not installed", { key, error: error.message }),
      ),
    );
  }
});

/** Offers the defaults in the background, so startup never waits on a plugin's first listing. */
export const layer = Layer.effectDiscard(Effect.forkScoped(offerDefaults));
