/**
 * The store over PostHog, after text-to-cad's (`apps/api/src/posthog.mjs` there). Every row a batch makes
 * (`events.mjs`) becomes one PostHog event under its own name, with the install id as its distinct id, the
 * batch's context and the event's properties, and the country the host placed the request in: never the IP
 * address, nor anything finer. PostHog's own location lookup is off for every event (`$geoip_disable`): the
 * receiver posts from the host's servers, so it would place everyone there.
 *
 * An opt-out deletes the install's person and every event under its id (`/forget`). PostHog does that in the
 * background, so "deleted" means "queued for deletion".
 *
 * Its settings are the host's (api/v1.mjs): the project's API key, which captures; a personal API key with
 * `person:write`, which deletes, and `project:read`, which checks the project is there; the project's id;
 * and its region, `us` or `eu`. `fetch` is handed in, so the tests need no network.
 */

export const SETTINGS = [
  "POSTHOG_REGION",
  "POSTHOG_PROJECT_KEY",
  "POSTHOG_PERSONAL_KEY",
  "POSTHOG_PROJECT_ID",
];
const REGIONS = new Set(["us", "eu"]);
const TIMEOUT_MS = 8000; // well inside a function's own limit: a PostHog that hangs is a failure, and the batch waits
// How long an instance keeps health's answer: /v1/health is open to anyone, and each check spends the personal key.
export const READY_TTL_MS = 60_000;

/** The settings a host lacks, by name: missing, or not what PostHog would take (health says so). */
export function missingSettings(env) {
  const valid = {
    POSTHOG_REGION: (value) => REGIONS.has(value),
    POSTHOG_PROJECT_ID: (value) => /^\d+$/.test(value ?? ""),
  };
  return SETTINGS.filter((name) => !(env[name] && (valid[name] ?? Boolean)(env[name])));
}

/** The store's settings, from the host's environment. */
export function settingsOf(env) {
  return {
    region: env.POSTHOG_REGION,
    projectKey: env.POSTHOG_PROJECT_KEY,
    personalKey: env.POSTHOG_PERSONAL_KEY,
    projectId: env.POSTHOG_PROJECT_ID,
  };
}

/** A row as one PostHog event: the batch's context after the event's own properties, so it always wins. */
export function eventOf(row, country) {
  return {
    uuid: row.id,
    event: row.event,
    timestamp: row.at,
    properties: {
      ...row.properties,
      distinct_id: row.install,
      version: row.version,
      platform: row.platform,
      arch: row.arch,
      mode: row.mode,
      $geoip_disable: true,
      ...(country ? { country } : {}),
    },
  };
}

/**
 * @param {{ region: string, projectKey: string, personalKey: string, projectId: string }} settings
 * @param {{ fetch?: typeof fetch, now?: () => number }} [options] `now`: the clock health's answer is kept by.
 */
export function posthogStore(
  { region, projectKey, personalKey, projectId },
  { fetch: send = fetch, now = Date.now } = {},
) {
  const capture = `https://${region}.i.posthog.com`;
  const api = `https://${region}.posthog.com/api/projects/${projectId}`;
  // Anything but a 2xx is the receiver's failure, never the client's: a 5xx tells it to keep its batch, or
  // the deletion it owes, and ask again. PostHog's answer is named by its status alone.
  const call = async (url, init) => {
    const response = await send(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw Object.assign(new Error(`PostHog answered ${response.status}`), {
        code: `posthog_${response.status}`,
      });
    }
    return response;
  };
  const authorized = { authorization: `Bearer ${personalKey}` };
  // Health's question, every setting at once: the region and the id name a project that answers to the
  // personal key, and the capture key is that project's own (`api_token`).
  const check = async () => {
    const project = await (await call(`${api}/`, { headers: authorized })).json().catch(() => ({}));
    if (typeof project?.api_token === "string" && project.api_token !== projectKey) {
      throw Object.assign(new Error("POSTHOG_PROJECT_KEY is not this project's"), {
        code: "posthog_project_key",
      });
    }
  };
  let checked = null;
  return {
    /** @param {object[]} rows @param {{ country?: string | null }} [context] */
    async insert(rows, { country = null } = {}) {
      await call(`${capture}/batch/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: projectKey,
          batch: rows.map((row) => eventOf(row, country)),
        }),
      });
    },
    async forget(install) {
      await call(`${api}/persons/bulk_delete/`, {
        method: "POST",
        headers: { "content-type": "application/json", ...authorized },
        body: JSON.stringify({ distinct_ids: [install], delete_events: true }),
      });
    },
    ready() {
      const at = now();
      if (!checked || at - checked.at >= READY_TTL_MS) checked = { at, answer: check() };
      return checked.answer;
    },
  };
}
