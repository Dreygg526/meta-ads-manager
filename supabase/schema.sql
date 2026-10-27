-- Ads Manager: who may sign in, with which role, and a log of every change made through the app.
-- Run once in the Supabase SQL editor. The app reads/writes these with the service role only,
-- so RLS is on with no policies: the anon key (in the browser) can't read or write them.

create table if not exists public.members (
  email      text primary key check (email = lower(email)),
  name       text,
  role       text not null check (role in ('admin', 'viewer')),
  added_by   text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor       text not null,
  account_id  text not null,
  object_id   text not null,
  object_name text,
  action      text not null,
  before      jsonb,
  after       jsonb,
  ok          boolean not null,
  error       text
);
create index if not exists audit_log_created_at on public.audit_log (created_at desc);

alter table public.members   enable row level security;
alter table public.audit_log enable row level security;

-- First admin: put YOUR email here before running.
insert into public.members (email, name, role, added_by)
values ('you@example.com', 'First admin', 'admin', 'setup')
on conflict (email) do nothing;
