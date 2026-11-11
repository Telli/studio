/**
 * Keeps the CAD tools' own counts (text-to-cad's telemetry, `cad telemetry on|off`) in step with Studio's
 * switch: on while Studio's usage counts are (a build with a receiver, the person told by the first-launch
 * notice, `shareUsageData` on, no `DO_NOT_TRACK` or CI), off otherwise. Off is text-to-cad's own: it deletes
 * the CAD tools' install id and asks the receiver to delete what was sent under it.
 *
 * It acts only on Studio's CAD tools: their state folder (`CAD_STATE_DIR`), their `cad` command
 * (`CAD_LAUNCHER_DIR`) and Studio's receiver (`CAD_API_URL`), all three set by the desktop app's
 * `studioEngineEnv`. Missing any one, it does nothing; without a receiver the desktop app keeps the CAD
 * tools' counts off for every process (`CAD_TELEMETRY=0`), so none reach text-to-cad's own receiver.
 *
 * @module CadToolsUsage
 */
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Config from "effect/Config";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import * as ProcessRunner from "../processRunner.ts";
import * as ServerSettings from "../serverSettings.ts";
import { usageDataAvailable } from "./AnalyticsService.ts";

const CadToolsConfig = Config.all({
  api: Config.String("CAD_API_URL").pipe(Config.withDefault("")),
  state: Config.String("CAD_STATE_DIR").pipe(Config.withDefault("")),
  launcher: Config.String("CAD_LAUNCHER_DIR").pipe(Config.withDefault("")),
});

// A `cad` command that has not come back by then is stopped, and asked again at the next check.
const COMMAND_TIMEOUT = "2 minutes";
// The CAD tools may not be installed yet at launch: the next check runs the command again.
const CHECK_EVERY = Duration.minutes(10);

type Choice = "on" | "off";

/** The choice the CAD tools keep (`settings.json`'s `telemetry.choice`), or null when they keep none. */
export function keptChoice(settingsJson: string | null): Choice | null {
  if (settingsJson === null) return null;
  try {
    const choice = (JSON.parse(settingsJson) as { telemetry?: { choice?: unknown } })?.telemetry
      ?.choice;
    return choice === "on" || choice === "off" ? choice : null;
  } catch {
    return null;
  }
}

/** What `cad telemetry` must be told for the CAD tools to share exactly when Studio does, or null. */
export function cadTelemetryCommand(studioShares: boolean, kept: Choice | null): Choice | null {
  if (studioShares) return kept === "on" ? null : "on";
  return kept === "on" ? "off" : null;
}

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* CadToolsConfig;
    if (!config.api || !config.state || !config.launcher) return;
    const available = yield* usageDataAvailable;
    const settings = yield* ServerSettings.ServerSettingsService;
    const runner = yield* ProcessRunner.ProcessRunner;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsFile = path.join(config.state, "settings.json");
    const platform = yield* HostProcess.Platform;
    const environment = yield* HostProcess.Environment;
    const command = path.join(config.launcher, platform === "win32" ? "cad.exe" : "cad");
    const lock = yield* Semaphore.make(1);

    const check = Effect.gen(function* () {
      const current = yield* settings.getSettings;
      const kept = keptChoice(
        yield* fileSystem.readFileString(settingsFile).pipe(Effect.orElseSucceed(() => null)),
      );
      const action = cadTelemetryCommand(
        available && current.shareUsageData && current.usageDataAnswered,
        kept,
      );
      if (action === null) return;
      const result = yield* runner.run({
        command,
        args: ["telemetry", action],
        timeout: COMMAND_TIMEOUT,
        env: environment,
      });
      if (result.code !== 0) {
        yield* Effect.logDebug("cad telemetry did not take the choice", {
          action,
          code: result.code,
        });
      }
    }).pipe(
      Effect.catchCause((cause) => Effect.logDebug("cad telemetry could not run", { cause })),
      lock.withPermits(1),
    );

    // At launch and every few minutes after (a tick comes at once), and whenever the switch changes.
    yield* Stream.merge(Stream.tick(CHECK_EVERY), settings.streamChanges).pipe(
      Stream.runForEach(() => check),
      Effect.forkScoped,
    );
  }),
);
