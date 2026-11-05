-- Studio's usage counts (infra/usage/src/store.mjs writes them). Run once in the Supabase project's SQL editor.

create table if not exists public.usage_events (
  id uuid primary key,            -- the event's own id, so a batch sent again inserts nothing new
  install uuid not null,          -- the install's random id: the one thing an opt-out deletes by
  event text not null,            -- one of README.md's "Usage data" list
  at timestamptz not null,        -- when the app counted it
  received_at timestamptz not null default now(),
  version text not null,
  platform text not null,
  arch text not null,
  mode text not null,
  country text,                   -- where Vercel placed the request; never the address
  properties jsonb not null default '{}'::jsonb
);

create index if not exists usage_events_install on public.usage_events (install);
create index if not exists usage_events_at on public.usage_events (at);

-- Only the receiver's service role key reaches the table: row-level security on, and no policy for anyone else.
alter table public.usage_events enable row level security;

-- How many installs used Studio each day (a chat turn, a CAD action or opening the app counts).
create or replace view public.usage_daily_installs with (security_invoker = true) as
  select date_trunc('day', at)::date as day, count(distinct install) as installs
  from public.usage_events
  group by 1
  order by 1 desc;

-- What got used each day, and by how many installs.
create or replace view public.usage_daily_events with (security_invoker = true) as
  select date_trunc('day', at)::date as day, event, count(*) as times, count(distinct install) as installs
  from public.usage_events
  group by 1, 2
  order by 1 desc, 3 desc;
