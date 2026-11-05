import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { eventOf, missingSettings, posthogStore, READY_TTL_MS } from "./posthog.mjs";

const SETTINGS = { region: "us", projectKey: "phc_x", personalKey: "phx_y", projectId: "42" };
const ROW = {
  id: "01970000-0000-7000-8000-000000000001",
  event: "cad.hand_edit",
  at: "2026-11-04T16:00:00.000Z",
  install: "0b7e4c5a-3c2d-4f6e-9a1b-2c3d4e5f6a7b",
  version: "0.1.5",
  platform: "darwin",
  arch: "arm64",
  mode: "desktop",
  properties: { version: "spoofed" },
};

function recorder(answer = () => new Response(null, { status: 200 })) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : undefined });
    return answer(url);
  };
  return { calls, fetch };
}

NodeTest.test(
  "an event keeps its id and time, and the batch's context wins over its properties",
  () => {
    NodeAssert.deepEqual(eventOf(ROW, "DE"), {
      uuid: ROW.id,
      event: "cad.hand_edit",
      timestamp: ROW.at,
      properties: {
        version: "0.1.5",
        distinct_id: ROW.install,
        platform: "darwin",
        arch: "arm64",
        mode: "desktop",
        $geoip_disable: true,
        country: "DE",
      },
    });
  },
);

NodeTest.test("captures with the project key and deletes with the personal key", async () => {
  const { calls, fetch } = recorder();
  const store = posthogStore(SETTINGS, { fetch });
  await store.insert([ROW]);
  await store.forget(ROW.install);
  NodeAssert.equal(calls[0].url, "https://us.i.posthog.com/batch/");
  NodeAssert.equal(calls[0].body.api_key, "phc_x");
  NodeAssert.equal(calls[1].url, "https://us.posthog.com/api/projects/42/persons/bulk_delete/");
  NodeAssert.equal(calls[1].init.headers.authorization, "Bearer phx_y");
  NodeAssert.deepEqual(calls[1].body, { distinct_ids: [ROW.install], delete_events: true });
});

NodeTest.test("a PostHog that refuses is a failure named by its status", async () => {
  const { fetch } = recorder(() => new Response(null, { status: 401 }));
  await NodeAssert.rejects(posthogStore(SETTINGS, { fetch }).insert([ROW]), {
    code: "posthog_401",
  });
});

NodeTest.test("health checks the capture key is the project's, at most once a minute", async () => {
  let at = 0;
  const { calls, fetch } = recorder(() => Response.json({ api_token: "phc_other" }));
  const store = posthogStore(SETTINGS, { fetch, now: () => at });
  await NodeAssert.rejects(store.ready(), { code: "posthog_project_key" });
  await NodeAssert.rejects(store.ready(), { code: "posthog_project_key" });
  NodeAssert.equal(calls.length, 1);
  at += READY_TTL_MS;
  await NodeAssert.rejects(store.ready());
  NodeAssert.equal(calls.length, 2);
});

NodeTest.test("names the settings a host lacks", () => {
  NodeAssert.deepEqual(missingSettings({ POSTHOG_REGION: "mars", POSTHOG_PROJECT_ID: "x" }), [
    "POSTHOG_REGION",
    "POSTHOG_PROJECT_KEY",
    "POSTHOG_PERSONAL_KEY",
    "POSTHOG_PROJECT_ID",
  ]);
});
