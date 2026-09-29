-- Training profile and session templates join athlete_docs.
--   prefs    : one document per climber (level, availability, dated goal, gear).
--              Written by the climber, read by their coach and admins. Not
--              health data: injuries and pain stay out of it.
--   routines : session templates, owned by whoever wrote them (athlete_id =
--              the owner, climber or coach).
-- Neither needs the health consent. prefs stay writable after the trial ends
-- (keeping one's profile up to date); templates follow the plan like sessions.

alter table public.athlete_docs drop constraint athlete_docs_col_check;
alter table public.athlete_docs add constraint athlete_docs_col_check
  check (col in ('sessions', 'assessments', 'pain', 'prefs', 'routines'));

create or replace function public.athlete_write_allowed(athlete uuid, col text, data jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is distinct from athlete then true
    else case public.plan_of(athlete)
      when 'expired' then col in ('pain', 'prefs')
      when 'trial' then
        (col <> 'assessments' or data ->> 'battery' = 'beginner')
        and (col <> 'sessions' or data ->> 'date' is null
             or (data ->> 'date')::date <= (select (p.trial_ends_at at time zone 'UTC')::date
                                            from public.profiles p where p.id = athlete))
      else true end
  end
$$;

drop policy "athlete_docs: create" on public.athlete_docs;
create policy "athlete_docs: create" on public.athlete_docs for insert to authenticated
  with check (public.can_access_athlete(athlete_id)
              and (col in ('sessions', 'prefs', 'routines') or public.has_health_consent(athlete_id))
              and public.athlete_write_allowed(athlete_id, col, data));

drop policy "athlete_docs: edit" on public.athlete_docs;
create policy "athlete_docs: edit" on public.athlete_docs for update to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id)
              and (col in ('sessions', 'prefs', 'routines') or public.has_health_consent(athlete_id))
              and public.athlete_write_allowed(athlete_id, col, data));
