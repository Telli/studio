import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as ServerSettings from "../serverSettings.ts";
import * as StudioGitHubSignIn from "./StudioGitHubSignIn.ts";

interface Recorded {
  readonly url: string;
  readonly params: URLSearchParams;
}

const github = (requests: Array<Recorded>, replies: Array<{ status?: number; body: unknown }>) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => {
        const body =
          request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";
        requests.push({ url: request.url, params: new URLSearchParams(body) });
        const reply = replies.shift() ?? { body: {} };
        return HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(reply.body), {
            status: reply.status ?? 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    ),
  );

const withSignIn = <A, E>(
  replies: Array<{ status?: number; body: unknown }>,
  body: (input: {
    readonly signIn: StudioGitHubSignIn.StudioGitHubSignIn["Service"];
    readonly requests: ReadonlyArray<Recorded>;
    readonly tokens: Effect.Effect<unknown, never, ServerSettings.ServerSettingsService>;
  }) => Effect.Effect<A, E, ServerSettings.ServerSettingsService>,
  overrides: Parameters<typeof ServerSettings.layerTest>[0] = {},
) => {
  const requests: Array<Recorded> = [];
  return Effect.gen(function* () {
    const signIn = yield* StudioGitHubSignIn.StudioGitHubSignIn;
    const tokens = ServerSettings.ServerSettingsService.pipe(
      Effect.flatMap((settings) => settings.getSettings),
      Effect.map(
        (settings) =>
          (settings.sourceControlHosts.github as { tokens?: unknown } | undefined)?.tokens,
      ),
      Effect.orDie,
    );
    return yield* body({ signIn, requests, tokens });
  }).pipe(
    Effect.provide(
      StudioGitHubSignIn.layer.pipe(
        Layer.provideMerge(ServerSettings.layerTest(overrides)),
        Layer.provide(github(requests, replies)),
      ),
    ),
  );
};

it.describe("StudioGitHubSignIn", () => {
  it.effect("asks GitHub for a code with Studio's client id and the repo scope", () =>
    withSignIn(
      [
        {
          body: {
            device_code: "device",
            user_code: "WDJB-MJHT",
            verification_uri: "https://github.com/login/device",
            expires_in: 900,
            interval: 5,
          },
        },
      ],
      ({ signIn, requests }) =>
        Effect.gen(function* () {
          const started = yield* signIn.start;
          assert.deepStrictEqual(started, {
            deviceCode: "device",
            userCode: "WDJB-MJHT",
            verificationUri: "https://github.com/login/device",
            intervalSeconds: 5,
            expiresInSeconds: 900,
          });
          assert.strictEqual(requests[0]?.url, "https://github.com/login/device/code");
          assert.strictEqual(requests[0]?.params.get("scope"), "repo");
          assert.isTrue((requests[0]?.params.get("client_id") ?? "").length > 0);
          assert.isNull(requests[0]?.params.get("client_secret") ?? null);
        }),
    ),
  );

  it.effect("says how far along the person is, and saves nothing until a token comes", () =>
    withSignIn(
      [
        { body: { error: "authorization_pending" } },
        { body: { error: "slow_down" } },
        { body: { error: "expired_token" } },
        { body: { error: "access_denied" } },
      ],
      ({ signIn, requests, tokens }) =>
        Effect.gen(function* () {
          const check = signIn.check({ deviceCode: "device" });
          assert.strictEqual((yield* check).state, "waiting");
          assert.strictEqual((yield* check).state, "slow-down");
          assert.strictEqual((yield* check).state, "expired");
          assert.strictEqual((yield* check).state, "denied");
          assert.strictEqual(
            requests[0]?.params.get("grant_type"),
            "urn:ietf:params:oauth:grant-type:device_code",
          );
          assert.isUndefined(yield* tokens);
        }),
    ),
  );

  it.effect("saves the token for github.com beside the tokens already saved", () =>
    withSignIn(
      [{ body: { access_token: "gho_new", token_type: "bearer", scope: "repo" } }],
      ({ signIn, tokens }) =>
        Effect.gen(function* () {
          const result = yield* signIn.check({ deviceCode: "device" });
          assert.deepStrictEqual(result, { state: "signed-in" });
          assert.deepStrictEqual(yield* tokens, {
            "github.example.com": "ghp_other",
            "github.com": "gho_new",
          });
        }),
      {
        sourceControlHosts: { github: { tokens: { "github.example.com": "ghp_other" } } },
      },
    ),
  );

  it.effect("reports an answer it cannot read as GitHub out of reach", () =>
    withSignIn(
      [{ status: 503, body: {} }, { body: { error: "incorrect_client_credentials" } }],
      ({ signIn }) =>
        Effect.gen(function* () {
          const outage = yield* Effect.flip(signIn.start);
          assert.strictEqual(outage.message, "GitHub could not be reached. Try again.");
          const refused = yield* Effect.flip(signIn.check({ deviceCode: "device" }));
          assert.strictEqual(refused._tag, "StudioGitHubSignInError");
        }),
    ),
  );
});
