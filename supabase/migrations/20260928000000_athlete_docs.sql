-- Per-athlete documents synced from the app's Store, one row per document.
-- First collection: training sessions (planned by the coach, validated by the athlete).
-- Readable and writable by the athlete, the athlete's coach, and admins.

create table public.athlete_docs (
  col         text not null check (col in ('sessions')),
  id          text not null,
  athlete_id  uuid not null references public.profiles (id) on delete cascade,
  data        jsonb not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (col, id)
);
create index athlete_docs_athlete_id_idx on public.athlete_docs (athlete_id);

-- The athlete (while active), their coach, or an admin.
create function public.can_access_athlete(athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (athlete = auth.uid() and public.my_role() is not null)
      or public.is_teacher_of(athlete)
      or public.is_admin()
$$;

create function public.stamp_athlete_doc() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger athlete_docs_stamp
  before insert or update on public.athlete_docs
  for each row execute function public.stamp_athlete_doc();

alter table public.athlete_docs enable row level security;

create policy "athlete_docs: read" on public.athlete_docs for select to authenticated
  using (public.can_access_athlete(athlete_id));
create policy "athlete_docs: create" on public.athlete_docs for insert to authenticated
  with check (public.can_access_athlete(athlete_id));
create policy "athlete_docs: edit" on public.athlete_docs for update to authenticated
  using (public.can_access_athlete(athlete_id)) with check (public.can_access_athlete(athlete_id));
create policy "athlete_docs: delete" on public.athlete_docs for delete to authenticated
  using (public.can_access_athlete(athlete_id));

revoke all on public.athlete_docs from anon;

-- Live updates in the app (Supabase Realtime applies the same RLS). Skipped where the
-- publication does not exist, e.g. the local test database.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.athlete_docs;
  end if;
end $$;
