// @effect-diagnostics nodeBuiltinImport:off -- fixtures are plugin folders and git repositories on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as PluginService from "./PluginService.ts";
import { fixture, layerFor, threadId } from "./PluginService.testFixtures.ts";

// In its own file: beside the plugin tests above, this test's types pushed ws.ts's RPC layer past
// TypeScript's instantiation limit (TS2589 at ServerWsRpcGroup.toLayer), and apps/server's tsc failed.
describe("plugins: Studio's app capability", () => {
  it.layer(NodeServices.layer)((it) => {
    it.effect(
      "asks the viewer's routes for Studio's own UI with the server's app capability",
      () => {
        const files = fixture();
        return Effect.gen(function* () {
          const plugins = yield* PluginService.PluginService;
          yield* plugins.install("local-market/demo");
          const route = (headers: Record<string, string>, scope: ThreadId | null = threadId) =>
            plugins
              .request({
                threadId: scope,
                pluginId: "demo",
                server: "main",
                method: "tools/call",
                params: {
                  name: "cad_http",
                  arguments: { method: "GET", url: "/__cad/recents", headers },
                },
              })
              .pipe(
                Effect.map(
                  (reply) =>
                    JSON.parse(
                      (reply.result as { content: Array<{ text: string }> }).content[0]!.text,
                    ).arguments.headers,
                ),
              );
          // The first capability the home launch gave was refused as stale: the next one is asked
          // for, and kept for the requests after.
          assert.deepEqual(yield* route({}), { "x-cadgen-app": "token-2" });
          assert.deepEqual(yield* route({ accept: "application/json" }), {
            accept: "application/json",
            "x-cadgen-app": "token-2",
          });
          // A view's own request carries its own, untouched.
          assert.deepEqual(yield* route({ "x-cadgen-app": "the view's" }), {
            "x-cadgen-app": "the view's",
          });
          // Reads that start together in a scope with none known (the environment's own server)
          // ask its home launch once, and once again together when that one is refused.
          const together = yield* Effect.all([route({}, null), route({}, null), route({}, null)], {
            concurrency: "unbounded",
          });
          assert.deepEqual(together, [
            { "x-cadgen-app": "token-2" },
            { "x-cadgen-app": "token-2" },
            { "x-cadgen-app": "token-2" },
          ]);
          // An agent never sees a launch's capability: it is the UI's alone.
          const called = (yield* plugins.callAgentTool({
            threadId,
            name: "demo__plain",
            arguments: { text: "launch" },
          })) as { _meta: Record<string, unknown> };
          assert.deepEqual(called._meta, { other: 1 });
        }).pipe(
          Effect.provide(
            layerFor(
              [{ type: "folder", path: files.market }],
              NodePath.join(files.dir, "t3"),
              files.work,
            ),
          ),
          Effect.ensuring(
            Effect.sync(() => NodeFS.rmSync(files.dir, { recursive: true, force: true })),
          ),
        );
      },
    );
  });
});
