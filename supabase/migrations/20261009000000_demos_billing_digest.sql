-- Exercise demonstration videos, self-service subscriptions (Stripe) and the weekly email.

-- ---------- Exercise demos ----------
-- One demonstration video per exercise (the latest one wins), added by a coach or
-- an admin. Visible to whoever can see the exercise. Files live in the private
-- bucket "exercise-media" ("<exercise uuid>/<file>"); path may also be an https URL.
create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('teacher', 'admin'), false)
$$;

create table public.exercise_demos (
  exercise_id uuid primary key references public.exercises (id) on delete cascade,
  path        text not null check (length(path) between 3 and 500),
  added_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now()
);
alter table public.exercise_demos enable row level security;

create policy "exercise_demos: read with the exercise" on public.exercise_demos for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id));
create policy "exercise_demos: staff add" on public.exercise_demos for insert to authenticated
  with check (public.is_staff() and added_by = auth.uid());
create policy "exercise_demos: staff replace" on public.exercise_demos for update to authenticated
  using (public.is_staff()) with check (public.is_staff() and added_by = auth.uid());
create policy "exercise_demos: staff remove" on public.exercise_demos for delete to authenticated
  using (public.is_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-media', 'exercise-media', false, 104857600, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy "exercise-media: read" on storage.objects for select to authenticated
  using (bucket_id = 'exercise-media');
create policy "exercise-media: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'exercise-media' and public.is_staff());
create policy "exercise-media: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'exercise-media' and public.is_staff());

-- ---------- Subscriptions ----------
-- Written only by the Stripe webhook (service role). A user can't touch them,
-- nor their plan (guard_plan already), so billing can't be redirected.
alter table public.profiles
  add column stripe_customer_id  text,
  add column subscription_status text,
  add column weekly_email        boolean not null default true;

create or replace function public.guard_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       new.plan is distinct from old.plan or new.trial_ends_at is distinct from old.trial_ends_at
  ) then
    raise exception 'only an admin can change a plan';
  end if;
  if auth.uid() is not null and (
       new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.subscription_status is distinct from old.subscription_status
  ) then
    raise exception 'billing fields are set by the payment provider only';
  end if;
  return new;
end $$;
