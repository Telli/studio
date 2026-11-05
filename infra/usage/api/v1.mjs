// Studio's usage receiver, /v1/*: counts forwarded to PostHog (src/). vercel.json rewrites every /v1 path to
// this one function, which keeps the path it was asked for, and the handler routes it.
import { handle } from "../src/handler.mjs";
import { clientOf, rateLimiter } from "../src/limit.mjs";
import { missingSettings, posthogStore, settingsOf } from "../src/posthog.mjs";

// Both live as long as the instance: the store keeps health's answer a minute, the limiter /v1/forget's counts.
let store;
const limiter = rateLimiter();
const serve = (request) =>
  handle(request, (store ??= posthogStore(settingsOf(process.env))), {
    // Names only: what /v1/health reports missing, so a deploy without them fails its check.
    missing: missingSettings(process.env),
    // Where Vercel's edge places the request, from its IP address: passed on as a country, the address kept nowhere.
    country: request.headers.get("x-vercel-ip-country"),
    limiter,
    client: clientOf(request.headers),
  });

export const GET = serve;
export const POST = serve;
