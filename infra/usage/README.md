# Usage receiver

Studio's usage counts go here and nowhere else. It is a Vercel project of its own (Root
Directory `infra/usage`), built the way text-to-cad's `api.texttocad.dev` is (`apps/api` in
text-to-cad): a single function, no npm dependencies, no build. It checks every batch against the
contract in [`src/events.mjs`](src/events.mjs) and passes it on to PostHog. Studio's builds name
only this receiver's address, and the receiver holds the PostHog keys, so no build carries a key.
That also means PostHog can be swapped out, or a bad event refused, without a release.

- `POST /v1/events`: One batch, schema 1: `{schema, install, version, platform, arch, mode, events: [{id, event, at, properties}]}` → `204` once PostHog has it. `install` is the install's random id. Each `event` must be one of README.md's "Usage data" list (a test holds the two together), and each property must be a plain name with a number, a boolean or a short word as its value: a path, a line break or anything longer is refused. Anything outside the contract is `400` and passes nothing on. Each event becomes one PostHog event under its own name, with `uuid` = its `id` and `timestamp` = its `at`, so a batch sent again counts once. Its properties are the batch's context, the country Vercel places the request in (`x-vercel-ip-country`), and `$geoip_disable` (nothing finer than the country).
- `POST /v1/forget`: `{install}` → `204` once PostHog has queued deletion of the install's person and every event under its id. Studio calls this when Share usage data is turned off, and keeps asking until it gets a `2xx`. Each instance allows 5 calls per 10 minutes per client address and per install id (`src/limit.mjs`, copied from text-to-cad); past that it answers `429` with `Retry-After`.
- `GET /v1/health`: → `200`, or `503` naming a missing setting, PostHog's status when it rejects the personal key, or `posthog_project_key` when the capture key belongs to another project.

A `POST` with an `Origin` header (any browser) is refused, and the receiver keeps no IP address.

## Set it up

1. Create a PostHog project. Note its region (`us` or `eu`), its project id and project API key,
   and make a personal API key with `person:write` and `project:read` on that project.
2. Create a Vercel project from this repository with Root Directory `infra/usage` and framework
   "Other". `vercel.json` turns off deploy-on-push, so it deploys only when asked.
3. Set `POSTHOG_REGION`, `POSTHOG_PROJECT_ID`, `POSTHOG_PROJECT_KEY` and `POSTHOG_PERSONAL_KEY`
   on the Vercel project. Deploy with `vercel deploy --prod` from `infra/usage`, then check that
   `GET <url>/v1/health` answers `{"ok":true}`.
4. Give Studio the address: the repository variable `STUDIO_USAGE_URL` (read by the Windows build)
   and `STUDIO_USAGE_URL=<url>` for `scripts/build-studio-app.sh`. A build made without it sends
   nothing.

```bash
node --test infra/usage/src/*.test.mjs
```
