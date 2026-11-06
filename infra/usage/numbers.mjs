/**
 * Studio's usage numbers, read from the two views schema.sql makes, by whoever is logged in to the Supabase CLI:
 *
 *   node infra/usage/numbers.mjs [days]
 *
 * It asks the CLI for the project's service role key for this one run, holds it in memory and prints only
 * counts per day: installs, and how often each event happened. No key, install id or property is printed.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";

const PROJECT = "mlkacarkcdxquuspekdr"; // Supabase project `studio-usage`
const REST = `https://${PROJECT}.supabase.co/rest/v1`;
const DEFAULT_DAYS = 14;

/** The report for rows of `usage_daily_installs` and `usage_daily_events`, newest day first. */
export function reportOf(installs, events) {
  if (installs.length === 0) return "No usage counts in this period.";
  const lines = [];
  for (const { day, installs: count } of installs) {
    lines.push(`${day}  ${count} install${count === 1 ? "" : "s"}`);
    for (const row of events.filter((event) => event.day === day)) {
      lines.push(`  ${String(row.times).padStart(6)}  ${row.event} (${row.installs})`);
    }
  }
  return lines.join("\n");
}

function serviceKey() {
  const listed = NodeChildProcess.spawnSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", PROJECT, "-o", "json"],
    { encoding: "utf8" },
  );
  if (listed.status !== 0) {
    throw new Error(
      "The Supabase CLI gave no keys. Is it installed, and has `supabase login` run?",
    );
  }
  const key = JSON.parse(listed.stdout).find((entry) => entry.name === "service_role")?.api_key;
  if (!key) throw new Error("The Supabase project has no service role key.");
  return key;
}

async function main(days) {
  const key = serviceKey();
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const view = async (name, order) => {
    const response = await fetch(`${REST}/${name}?day=gte.${since}&order=${order}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error(`${name} answered ${response.status}.`);
    return response.json();
  };
  const [installs, events] = await Promise.all([
    view("usage_daily_installs", "day.desc"),
    view("usage_daily_events", "day.desc,times.desc"),
  ]);
  console.log(reportOf(installs, events));
}

if (NodeProcess.argv[1] === NodeURL.fileURLToPath(import.meta.url)) {
  const days = Number(NodeProcess.argv[2] ?? DEFAULT_DAYS);
  if (!Number.isInteger(days) || days < 1) {
    console.error("usage: node infra/usage/numbers.mjs [days]");
    NodeProcess.exit(2);
  }
  main(days).catch((error) => {
    console.error(error.message);
    NodeProcess.exit(1);
  });
}
