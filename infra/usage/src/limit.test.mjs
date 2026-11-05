import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";
import { clientOf, FORGET_LIMIT, rateLimiter } from "./limit.mjs";

const clock = (at = 0) => {
  const now = () => at;
  now.advance = (ms) => {
    at += ms;
  };
  return now;
};

NodeTest.test(
  "a key may ask five times in ten minutes; the sixth is refused with the seconds to wait, another key is not",
  () => {
    NodeAssert.deepEqual(FORGET_LIMIT, { limit: 5, windowMs: 600_000, size: 1000 });
    const now = clock();
    const limiter = rateLimiter({ now });
    for (let i = 0; i < 5; i += 1) {
      NodeAssert.deepEqual(limiter.take("a"), { ok: true });
      now.advance(1000);
    }
    NodeAssert.deepEqual(limiter.take("a"), { ok: false, retryAfter: 595 });
    NodeAssert.deepEqual(limiter.take("b"), { ok: true });
    // A refusal counts nothing: once the first request leaves the window, one more is taken.
    now.advance(595_000);
    NodeAssert.deepEqual(limiter.take("a"), { ok: true });
    NodeAssert.equal(limiter.take("a").ok, false);
  },
);

NodeTest.test("the map keeps at most its size, the oldest key evicted first", () => {
  const limiter = rateLimiter({ limit: 1, size: 3, now: clock() });
  for (const key of ["a", "b", "c", "d"]) limiter.take(key);
  NodeAssert.equal(limiter.size, 3);
  NodeAssert.equal(limiter.take("a").ok, true); // evicted, so counted afresh
  NodeAssert.equal(limiter.take("d").ok, false); // kept
  NodeAssert.equal(limiter.size, 3);
});

NodeTest.test(
  "the client is Vercel's forwarded address, else x-forwarded-for's first hop, else none",
  () => {
    NodeAssert.equal(
      clientOf(
        new Headers({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }),
      ),
      "203.0.113.7",
    );
    NodeAssert.equal(
      clientOf(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })),
      "198.51.100.1",
    );
    NodeAssert.equal(clientOf(new Headers()), null);
  },
);
