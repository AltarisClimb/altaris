-- Subscription plans for climbers: trial (7 days), standard (monthly), premium (monthly).
--   trial    : sign-up, basic tests (beginner battery), one week of programme
--   standard : full tests, programmes
--   premium  : standard + messaging with their coach + one 30-min video call a month
-- An expired trial keeps the account and history but cannot train or test until a plan
-- is chosen. Plans are set by an admin (online payment can come later).

alter table public.profiles
  add column plan          text not null default 'trial' check (plan in ('trial', 'standard', 'premium')),
  add column trial_ends_at timestamptz default (now() + interval '7 days');

-- Existing climbers keep what they had (a coach and messaging): premium. Staff have no trial.
update public.profiles set plan = 'premium', trial_ends_at = null where role = 'student';
update public.profiles set trial_ends_at = null where role <> 'student';

-- Only an admin changes a plan or a trial end date.
create function public.guard_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.plan is distinct from old.plan or new.trial_ends_at is distinct from old.trial_ends_at
  ) then
    raise exception 'only an admin can change a plan';
  end if;
  return new;
end $$;

create trigger profiles_guard_plan
  before update on public.profiles
  for each row execute function public.guard_plan();

-- Effective plan: 'staff' for teachers/admins, 'expired' once a trial is over.
create function public.plan_of(u uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p.role <> 'student' then 'staff'
              when p.plan = 'trial' and p.trial_ends_at is not null and p.trial_ends_at < now() then 'expired'
              else p.plan end
  from public.profiles p where p.id = u
$$;

-- What a climber may write about themselves under their plan. Staff writes are only
-- governed by can_access_athlete. The pain log always stays open (safety).
create function public.athlete_write_allowed(athlete uuid, col text, data jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is distinct from athlete then true
    else case public.plan_of(athlete)
      when 'expired' then col = 'pain'
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
              and (col = 'sessions' or public.has_health_consent(athlete_id))
              and public.athlete_write_allowed(athlete_id, col, data));

drop policy "athlete_docs: edit" on public.athlete_docs;
create policy "athlete_docs: edit" on public.athlete_docs for update to authenticated
  using (public.can_access_athlete(athlete_id))
  with check (public.can_access_athlete(athlete_id)
              and (col = 'sessions' or public.has_health_consent(athlete_id))
              and public.athlete_write_allowed(athlete_id, col, data));

-- Messaging with the coach is a premium feature (both directions).
drop policy "messages: write in own conversations" on public.messages;
create policy "messages: write in own conversations" on public.messages for insert to authenticated
  with check (public.can_access_athlete(athlete_id) and public.plan_of(athlete_id) = 'premium');

-- Climbers on a live plan (trial, standard, premium) can browse the library, so their
-- programmes can show every exercise. An expired trial is back to free + assigned.
drop policy "exercises: read free, library (staff), assigned" on public.exercises;
create policy "exercises: read free, library (staff, subscribers), assigned"
  on public.exercises for select to authenticated
  using (
    visibility = 'free'
    or public.is_admin()
    or (visibility = 'library' and public.my_role() = 'teacher')
    or (visibility = 'library' and public.my_role() = 'student'
        and public.plan_of((select auth.uid())) in ('trial', 'standard', 'premium'))
    or public.is_assigned_to_me(id)
  );

-- "I'd like this plan": requests the admin sees and marks as handled.
create table public.plan_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  plan        text not null check (plan in ('standard', 'premium')),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);
alter table public.plan_requests enable row level security;
create policy "plan_requests: ask for oneself" on public.plan_requests for insert to authenticated
  with check (user_id = auth.uid() and handled_at is null);
create policy "plan_requests: own or admin" on public.plan_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "plan_requests: admin handles" on public.plan_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "plan_requests: admin deletes" on public.plan_requests for delete to authenticated
  using (public.is_admin());
revoke all on public.plan_requests from anon;
