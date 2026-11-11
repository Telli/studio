import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeTest from "node:test";

import { CAD_EVENTS, cadToolsRowsOf } from "./cadtools.mjs";
import { handle } from "./handler.mjs";

const INSTALL = "4c2f7a1e-9b3d-4e5f-8a6b-1c2d3e4f5a6b";
const SESSION = "5d3e8b2f-0c4e-4f6a-9b7c-2d3e4f5a6b7c";
// What the CAD tools Studio bundles send (schema 9): one build window's counts and a view's controls.
const BATCH = {
  schema: 9,
  install: INSTALL,
  session: SESSION,
  process: "daemon",
  version: "0.11.6",
  channel: "dev",
  platform: "darwin",
  arch: "arm64",
  batch: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  at: 1_791_500_000,
  events: [
    {
      name: "build",
      kind: "model",
      via: "script",
      count: 3,
      failed: 1,
      crashed: 0,
      cancelled: 0,
      cached: 1,
      seconds: 2.5,
      longest: 1.5,
    },
    { name: "build_failure", kind: "model", via: "script", reason: "model_error", count: 1 },
    { name: "feature", feature: "drawing", count: 2 },
  ],
};

const post = (path, body) =>
  new Request(`https://usage.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function memoryStore() {
  const store = {
    inserted: [],
    forgotten: [],
    async insert(rows, context) {
      store.inserted.push({ rows, context });
    },
    async forget(install) {
      store.forgotten.push(install);
    },
    async ready() {},
  };
  return store;
}

NodeTest.test("keeps text-to-cad's receiver rules exactly as Jake wrote them", () => {
  for (const name of ["events.mjs", "noise.mjs"]) {
    const ours = NodeFS.readFileSync(new URL(`./cad/${name}`, import.meta.url), "utf8");
    const jakes = NodeFS.readFileSync(
      new URL(`../../../text-to-cad/apps/api/src/${name}`, import.meta.url),
      "utf8",
    );
    NodeAssert.equal(ours, jakes, `infra/usage/src/cad/${name} differs from text-to-cad's`);
  }
});

NodeTest.test("turns a CAD tools batch into rows of Studio's table", () => {
  const { rows } = cadToolsRowsOf(BATCH);
  NodeAssert.deepEqual(
    rows.map((row) => row.event),
    ["cadtools.build", "cadtools.build_failure", "cadtools.feature"],
  );
  const [build] = rows;
  NodeAssert.equal(build.install, INSTALL);
  NodeAssert.equal(build.at, new Date(BATCH.at * 1000).toISOString());
  NodeAssert.equal(build.mode, "daemon");
  NodeAssert.equal(build.properties.count, 3);
  NodeAssert.equal(build.properties.kind, "model");
  NodeAssert.ok(rows.every((row) => CAD_EVENTS.has(row.event)));
  // The same batch sent again is the same rows, id for id.
  NodeAssert.deepEqual(
    cadToolsRowsOf(BATCH).rows.map((row) => row.id),
    rows.map((row) => row.id),
  );
});

NodeTest.test("takes CAD tools batches and deletions on their own paths", async () => {
  const store = memoryStore();
  const taken = await handle(post("/v1/cad/events", BATCH), store, { country: "US" });
  NodeAssert.equal(taken.status, 204);
  NodeAssert.equal(store.inserted[0].rows.length, 3);
  NodeAssert.deepEqual(store.inserted[0].context, { country: "US" });
  const forgot = await handle(post("/v1/cad/forget", { install: INSTALL }), store);
  NodeAssert.equal(forgot.status, 204);
  NodeAssert.deepEqual(store.forgotten, [INSTALL]);
});

NodeTest.test(
  "refuses what text-to-cad's rules refuse, a path or a file name included",
  async () => {
    const refused = [
      { ...BATCH, events: [{ name: "feature", feature: "/Users/amy/bracket.step", count: 1 }] },
      {
        ...BATCH,
        events: [{ name: "build", kind: "step", via: "script", count: 1, file: "a.step" }],
      },
      { ...BATCH, schema: 99 },
      { ...BATCH, prompt: "make a bracket" },
    ];
    for (const batch of refused) {
      const store = memoryStore();
      const answer = await handle(post("/v1/cad/events", batch), store);
      NodeAssert.equal(answer.status, 400);
      NodeAssert.equal(store.inserted.length, 0);
    }
    // A Studio batch is not a CAD tools batch.
    const studio = await handle(post("/v1/cad/events", { schema: 1, events: [] }), memoryStore());
    NodeAssert.equal(studio.status, 400);
  },
);
