-- TELES ADS CONTROL — schema v1 (derived from implemented features)
create table if not exists users (
  tg_id bigint primary key,
  username text, name text,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table if not exists settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table if not exists ads_snapshot (
  id serial primary key, ad_id bigint not null, status text, data jsonb not null,
  captured_at timestamptz not null default now()
);
create index if not exists idx_adsnap on ads_snapshot(ad_id, captured_at desc);
create table if not exists channels (
  username text primary key, title text, members bigint, niche text, geo text, lang text,
  source text not null default 'tgadsspy', raw jsonb,
  first_seen_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists research_lists (
  id serial primary key, name text not null unique, created_by bigint,
  created_at timestamptz not null default now()
);
create table if not exists research_list_items (
  list_id int not null references research_lists(id) on delete cascade,
  username text not null, note text, added_at timestamptz not null default now(),
  primary key(list_id, username)
);
create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null, text text not null, promote_url text not null,
  target jsonb not null, cpm numeric not null default 0.6,
  initial_budget numeric not null, daily_budget_limit numeric,
  placement text not null default 'channel_post',
  status text not null default 'draft',
  launched_ad_id bigint, last_error text,
  created_by bigint, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ai_usage (
  id serial primary key, tg_id bigint, provider text, model text, purpose text,
  prompt_tokens int default 0, completion_tokens int default 0, est_cost_usd numeric default 0,
  created_at timestamptz not null default now()
);
create table if not exists ai_budget (
  key text primary key check(key in('daily_user','daily_global')),
  limit_usd numeric not null, enabled boolean not null default true
);
insert into ai_budget(key,limit_usd) values ('daily_user',0.50),('daily_global',5.00) on conflict (key) do nothing;
create table if not exists alerts (
  id serial primary key, tg_id bigint not null, kind text not null,
  params jsonb not null default '{}', enabled boolean not null default true,
  last_run_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists audit_log (
  id serial primary key, tg_id bigint, action text not null, payload jsonb,
  result text, created_at timestamptz not null default now()
);
create table if not exists jobs (
  id serial primary key, name text not null, payload jsonb,
  status text not null default 'pending', attempts int not null default 0,
  last_error text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
