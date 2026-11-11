/**
 * The CAD tools' own counts: what text-to-cad's telemetry (`cad_server/analytics.py` in the submodule) sends
 * from the CAD tools Studio bundles, which Studio points at this receiver (`CAD_API_URL`, set by the desktop
 * app's `studioEngineEnv`) and switches on and off with Studio's own switch (the server's `CadToolsUsage`).
 *
 * Each batch is checked by text-to-cad's own receiver rules (`cad/events.mjs`, a byte-for-byte copy of
 * `text-to-cad/apps/api/src/events.mjs` that a test holds to the submodule), and the crashes that are never
 * text-to-cad's bug are dropped as Jake's receiver drops them (`cad/noise.mjs`, likewise). What passes becomes
 * rows of Studio's own table, under the CAD tools' install id (a random id of their own, never Studio's) and
 * the event's name with `cadtools.` before it.
 */
import { FIELDS, Invalid as CadInvalid, rowsOf as cadRows, uuidV5 } from "./cad/events.mjs";
import { withoutNoise } from "./cad/noise.mjs";
import { Invalid } from "./events.mjs";

export const PREFIX = "cadtools.";

/** Every CAD tools event this receiver keeps, as README.md lists them. */
export const CAD_EVENTS = new Set(Object.keys(FIELDS).map((name) => `${PREFIX}${name}`));

// A row's own columns in Studio's table; everything else it carries goes in `properties`.
const COLUMNS = new Set([
  "id",
  "install_id",
  "event",
  "at",
  "version",
  "platform",
  "arch",
  "process",
]);

/**
 * A CAD tools batch as Studio's rows (`events.mjs`'s shape), or `Invalid`, and how many crashes were dropped.
 * @param {unknown} batch
 * @param {number} now ms since 1970, for a row whose batch names no time
 */
export function cadToolsRowsOf(batch, now = Date.now()) {
  let checked;
  try {
    checked = cadRows(batch);
  } catch (error) {
    // Refused as any batch is, by the rule's words alone (handler.mjs's `reasonOf`).
    if (error instanceof CadInvalid) throw new Invalid(error.message);
    throw error;
  }
  const { rows, dropped } = withoutNoise(checked);
  return {
    dropped,
    rows: rows.map((row) => ({
      // Schemas 5 on name each row; an older one's row is named by what it says, so a copy inserts nothing.
      id: row.id ?? uuidV5(JSON.stringify(row)),
      event: `${PREFIX}${row.event}`,
      at: new Date(typeof row.at === "number" ? row.at * 1000 : now).toISOString(),
      install: row.install_id.toLowerCase(),
      version: row.version,
      platform: row.platform,
      arch: row.arch ?? "unknown",
      mode: row.process ?? "unknown",
      properties: Object.fromEntries(Object.entries(row).filter(([key]) => !COLUMNS.has(key))),
    })),
  };
}
