# Product analytics

Studio sends usage counts the way text-to-cad does: to a receiver of its own
([`infra/usage`](../../infra/usage/README.md)), which checks every batch and passes it to
PostHog. No build carries a PostHog key, so the receiver can refuse, or PostHog be replaced,
without a release. Nothing below runs unless the build names the receiver (`T3CODE_USAGE_URL`).

The server owns delivery, opt-out, and identity for every connected client. The identity
is the install's random id ([`getInstallId`](../../apps/server/src/telemetry/Identify.ts)),
never one derived from a provider account, because an opt-out deletes by it. It can span
several clients; it does not identify a browser session. Nothing is sent until the
first-launch notice has been shown (`usageDataNoticeShown`), and turning sharing off owes
the receiver a deletion of everything sent under the id, kept across restarts until taken;
no batch goes out while one is owed. Clients do not load the PostHog browser SDK. Client-use events require an authenticated connection, so
visiting the hosted app without connecting does not count as product use.

## Attribution boundaries

Client dimensions belong to the event's WebSocket connection. A server-global
"current client" would misattribute simultaneous web, desktop, and mobile use.
Provider execution has its own events because a turn can outlive the requesting
connection.

Keep client and server dimensions separate. A desktop host can serve a phone or a
remote browser, and a direct connection can cross a network. Older clients omit
metadata. Missing client values must stay unknown rather than being backfilled
from server properties. The batch's `mode` describes how the server runs; use
`surface` for the connected client.

## Interpreting events

Use `client.turn.requested` for active-use reports. `client.connected` counts
reconnects, so network behavior can inflate it. One identity can appear in several
client groups during a period; adding those groups double-counts users.

Provider send and completion counts need not match. Providers can emit synthetic
turns without a send request. Collection is best effort, with no scan or backfill
of provider history.

Token totals cover the main agent. Child agents and model rerouting prevent a turn
from representing one provider/model combination's full cost. For provider
comparisons, require complete usage, no observed subagents, and no mixed models;
compare matching model, effort, interaction mode, and terminal status. Aggregate
output/input ratios should divide the summed totals. Averaging per-turn ratios
lets small-input turns dominate.

Unknown counts stay absent. Partial usage contains valid observed counts but
cannot establish a whole-turn total. Keep these distinctions when changing token
normalization or building reports.

## Delivery

A send can fail after PostHog has stored the batch, so every retry is a copy.
[Delivery](../../apps/server/src/telemetry/AnalyticsService.ts) gives each event a
uuid when it is recorded, backs off after a failed send, and drops a batch after a
few tries. Without these limits, one stuck batch was sent every second for days.

## Collection boundary

Keep analytics payloads to product metadata and normalized measurements. Do not
send prompts, authentication material, raw provider payloads, user-assigned device
names, or conversation identifiers. Client metadata is best effort; invalid values
must not reject a connection. The receiver refuses any event or property outside its contract,
so a new event needs its list, the README's and the server's to change together.
