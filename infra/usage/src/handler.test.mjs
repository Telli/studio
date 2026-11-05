import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { batchOf } from "./fixtures.mjs";
import { handle } from "./handler.mjs";
import { rateLimiter } from "./limit.mjs";

const INSTALL = "0b7e4c5a-3c2d-4f6e-9a1b-2c3d4e5f6a7b";
const EVENT = {
  id: "01970000-0000-7000-8000-000000000001",
  event: "cad.model.opened",
  at: "2026-11-04T16:00:00.000Z",
};

function memoryStore({ fail = false } = {}) {
  const store = {
    inserted: [],
    forgotten: [],
    async insert(rows, context) {
      if (fail) throw Object.assign(new Error("down"), { code: "database_503" });
      store.inserted.push({ rows, context });
    },
    async forget(install) {
      store.forgotten.push(install);
    },
    async ready() {
      if (fail) throw Object.assign(new Error("down"), { code: "database_503" });
    },
  };
  return store;
}

const post = (path, body, headers = {}) =>
  new Request(`https://usage.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

NodeTest.test("takes a batch and passes its rows on with the country", async () => {
  const store = memoryStore();
  const response = await handle(post("/v1/events", batchOf([EVENT])), store, { country: "US" });
  NodeAssert.equal(response.status, 204);
  NodeAssert.equal(store.inserted.length, 1);
  NodeAssert.equal(store.inserted[0].rows[0].event, "cad.model.opened");
  NodeAssert.deepEqual(store.inserted[0].context, { country: "US" });
});

NodeTest.test(
  "refuses a batch outside the contract, a browser's post and a body that is not JSON",
  async () => {
    const store = memoryStore();
    const bad = await handle(
      post("/v1/events", batchOf([{ ...EVENT, event: "chat.prompt" }])),
      store,
    );
    NodeAssert.equal(bad.status, 400);
    const browser = await handle(
      post("/v1/events", batchOf([EVENT]), { origin: "https://evil.example" }),
      store,
    );
    NodeAssert.equal(browser.status, 403);
    const text = await handle(post("/v1/events", "hello", { "content-type": "text/plain" }), store);
    NodeAssert.equal(text.status, 415);
    NodeAssert.equal(store.inserted.length, 0);
  },
);

NodeTest.test("a store that fails is a 500, so Studio keeps its batch", async () => {
  const response = await handle(post("/v1/events", batchOf([EVENT])), memoryStore({ fail: true }));
  NodeAssert.equal(response.status, 500);
});

NodeTest.test("forgets an install, and limits how often one caller may ask", async () => {
  const store = memoryStore();
  const limiter = rateLimiter({ limit: 1 });
  const first = await handle(post("/v1/forget", { install: INSTALL.toUpperCase() }), store, {
    limiter,
    client: "1.2.3.4",
  });
  NodeAssert.equal(first.status, 204);
  NodeAssert.deepEqual(store.forgotten, [INSTALL]);
  const second = await handle(post("/v1/forget", { install: INSTALL }), store, {
    limiter,
    client: "1.2.3.4",
  });
  NodeAssert.equal(second.status, 429);
  NodeAssert.ok(Number(second.headers.get("retry-after")) > 0);
  const notAnId = await handle(post("/v1/forget", { install: "amy" }), store);
  NodeAssert.equal(notAnId.status, 400);
});

NodeTest.test("health names what is missing, or says the database will not answer", async () => {
  const health = new Request("https://usage.example/v1/health");
  const missing = await handle(health, memoryStore(), { missing: ["SUPABASE_SERVICE_ROLE_KEY"] });
  NodeAssert.equal(missing.status, 503);
  NodeAssert.deepEqual(await missing.json(), { ok: false, missing: ["SUPABASE_SERVICE_ROLE_KEY"] });
  const down = await handle(health, memoryStore({ fail: true }));
  NodeAssert.deepEqual(await down.json(), { ok: false, error: "database_503" });
  NodeAssert.equal((await handle(health, memoryStore())).status, 200);
});
