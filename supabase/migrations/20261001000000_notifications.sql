-- Push notifications (Web Push) and private calendar subscriptions (webcal).
-- The Edge Functions in supabase/functions/ use these tables; see README §5.

-- Where each device can receive notifications. A user only sees and manages their own.
create table public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: own devices" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Secret address of a climber's calendar feed. Whoever has the link can read the
-- sessions in it (that is how calendar subscriptions work), so it can be reset.
create table public.calendar_tokens (
  user_id     uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  token       text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now()
);

alter table public.calendar_tokens enable row level security;
create policy "calendar_tokens: own token" on public.calendar_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Session times are local to the climber: the reminder job needs their time zone,
-- and notifications are written in their language.
alter table public.profiles
  add column timezone text check (length(timezone) <= 64),
  add column lang     text check (lang in ('fr', 'en'));

-- Reminders already sent, so the scheduled job never notifies twice.
create table public.notification_log (
  kind        text not null,
  ref         text not null,
  sent_at     timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.notification_log enable row level security;
-- No policy: only the service role (Edge Functions) reads and writes it.

revoke all on public.push_subscriptions, public.calendar_tokens, public.notification_log from anon;
