import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import * as ProviderSessionManager from "../orchestration-v2/ProviderSessionManager.ts";
import * as PluginService from "./PluginService.ts";
import * as PluginToolSessions from "./PluginToolSessions.ts";

const tool = (
  name: string,
  description: string,
  meta?: Readonly<Record<string, unknown>>,
): PluginService.AgentTool => ({
  name: `cad__${name}`,
  pluginId: "cad",
  server: "cad",
  tool: { name, description, inputSchema: { type: "object" }, ...(meta ? { _meta: meta } : {}) },
});

describe("PluginToolSessions", () => {
  it.effect("lets provider sessions go only when the tools agents see change", () =>
    Effect.gen(function* () {
      const tools = yield* Ref.make<ReadonlyArray<PluginService.AgentTool>>([]);
      const changes = yield* PubSub.unbounded<void>();
      const releases = yield* Ref.make(0);
      const plugins = PluginService.PluginService.of({
        agentTools: Ref.get(tools),
        changes: Stream.fromPubSub(changes),
      } as unknown as PluginService.PluginService["Service"]);
      const sessions = ProviderSessionManager.ProviderSessionManagerV2.of({
        releaseWhenIdle: Ref.update(releases, (count) => count + 1),
      } as unknown as ProviderSessionManager.ProviderSessionManagerV2Shape);
      const change = (next: ReadonlyArray<PluginService.AgentTool>) =>
        Ref.set(tools, next).pipe(
          Effect.andThen(PubSub.publish(changes, undefined)),
          Effect.andThen(Effect.yieldNow),
        );

      yield* Effect.gen(function* () {
        yield* Effect.yieldNow;
        // The plugin's server comes back: its tools appear.
        yield* change([tool("cad_file", "Open a CAD file")]);
        assert.equal(yield* Ref.get(releases), 1);
        // Listed again with the same tools, or only their UI metadata moved: agents see no change.
        yield* change([tool("cad_file", "Open a CAD file")]);
        yield* change([tool("cad_file", "Open a CAD file", { ui: { resourceUri: "ui://cad" } })]);
        assert.equal(yield* Ref.get(releases), 1);
        // A tool's definition changes, then the plugin is turned off.
        yield* change([tool("cad_file", "Open a CAD or STEP file")]);
        yield* change([]);
        assert.equal(yield* Ref.get(releases), 3);
      }).pipe(
        Effect.provide(
          PluginToolSessions.layer.pipe(
            Layer.provide(
              Layer.merge(
                Layer.succeed(PluginService.PluginService, plugins),
                Layer.succeed(ProviderSessionManager.ProviderSessionManagerV2, sessions),
              ),
            ),
          ),
        ),
      );
    }),
  );
});
