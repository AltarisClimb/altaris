-- Messaging between a climber and their coaching staff.
-- One conversation per athlete: the athlete, their coach and admins take part.
-- One row per message (no read-modify-write of a whole thread, so concurrent
-- senders never overwrite each other). Messages are immutable.

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (length(body) between 1 and 4000),
  context     text check (length(context) <= 200),
  video_url   text check (video_url ~ '^https?://' and length(video_url) <= 2000),
  created_at  timestamptz not null default now()
);
create index messages_athlete_id_created_at_idx on public.messages (athlete_id, created_at);

-- The server decides who sent a message and when.
create function public.stamp_message() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.sender_id := auth.uid();
  new.created_at := now();
  return new;
end $$;

create trigger messages_stamp
  before insert on public.messages
  for each row execute function public.stamp_message();

alter table public.messages enable row level security;

create policy "messages: read own conversations" on public.messages for select to authenticated
  using (public.can_access_athlete(athlete_id));
create policy "messages: write in own conversations" on public.messages for insert to authenticated
  with check (public.can_access_athlete(athlete_id));
-- No update / delete policy: messages cannot be edited or removed from the app.

-- Where each participant stopped reading a conversation (for unread badges).
create table public.message_reads (
  athlete_id    uuid not null references public.profiles (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  last_read_at  timestamptz not null,
  primary key (athlete_id, user_id)
);

alter table public.message_reads enable row level security;

create policy "message_reads: own markers" on public.message_reads for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_access_athlete(athlete_id));

revoke all on public.messages, public.message_reads from anon;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
