-- Health data (GDPR art. 9): physical assessments and the pain log join athlete_docs,
-- but only for climbers who gave explicit consent. Withdrawing consent erases them.

alter table public.profiles
  add column health_consent_at      timestamptz,
  add column health_consent_version text;

-- Only the person themselves can give or withdraw consent (not a coach, not an admin).
-- auth.uid() is null for the SQL editor / service role, kept for support cases.
create function public.guard_health_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() <> new.id and (
       new.health_consent_at      is distinct from old.health_consent_at
    or new.health_consent_version is distinct from old.health_consent_version
  ) then
    raise exception 'only the person concerned can give or withdraw health-data consent';
  end if;
  return new;
end $$;

create trigger profiles_guard_health_consent
  before update on public.profiles
  for each row execute function public.guard_health_consent();

create function public.has_health_consent(athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = athlete and p.health_consent_at is not null)
$$;

-- New collections.
alter table public.athlete_docs drop constraint athlete_docs_col_check;
alter table public.athlete_docs add constraint athlete_docs_col_check
  check (col in ('sessions', 'assessments', 'pain'));

-- Health collections can only be written for a climber who consented.
drop policy "athlete_docs: create" on public.athlete_docs;
create policy "athlete_docs: create" on public.athlete_docs for insert to authenticated
  with check (public.can_access_athlete(athlete_id)
              and (col = 'sessions' or public.has_health_consent(athlete_id)));

drop policy "athlete_docs: edit" on public.athlete_docs;
create policy "athlete_docs: edit" on public.athlete_docs for update to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id)
              and (col = 'sessions' or public.has_health_consent(athlete_id)));

-- Withdrawal erases the climber's health documents.
create function public.erase_health_data_on_withdrawal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.health_consent_at is not null and new.health_consent_at is null then
    delete from public.athlete_docs where athlete_id = new.id and col in ('assessments', 'pain');
  end if;
  return new;
end $$;

create trigger profiles_erase_health_data
  after update of health_consent_at on public.profiles
  for each row execute function public.erase_health_data_on_withdrawal();
