-- Premium: one 30-minute video call a month with one's coach, booked on slots the
-- coach publishes. Each slot carries a private room name (Jitsi link built by the app).

create table public.call_slots (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  starts_at   timestamptz not null,
  minutes     int not null default 30 check (minutes between 15 and 60),
  booked_by   uuid references public.profiles (id) on delete set null,
  booked_at   timestamptz,
  room        text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now(),
  unique (coach_id, starts_at)
);
create index call_slots_coach_starts_idx on public.call_slots (coach_id, starts_at);
create index call_slots_booked_by_idx on public.call_slots (booked_by);

alter table public.call_slots enable row level security;

-- The coach sees their slots; admins see all; a climber sees their coach's free slots and their own bookings.
create policy "call_slots: read" on public.call_slots for select to authenticated
  using (
    coach_id = auth.uid() or public.is_admin()
    or (public.my_role() = 'student' and coach_id = public.my_teacher_id()
        and (booked_by is null or booked_by = auth.uid()))
  );
create policy "call_slots: coach publishes" on public.call_slots for insert to authenticated
  with check (coach_id = auth.uid() and public.my_role() in ('teacher', 'admin') and starts_at > now());
create policy "call_slots: coach removes" on public.call_slots for delete to authenticated
  using (coach_id = auth.uid() or public.is_admin());
create policy "call_slots: book or manage" on public.call_slots for update to authenticated
  using (
    coach_id = auth.uid() or public.is_admin()
    or (public.my_role() = 'student' and coach_id = public.my_teacher_id()
        and (booked_by is null or booked_by = auth.uid()))
  )
  with check (
    coach_id = auth.uid() or public.is_admin()
    or (public.my_role() = 'student' and coach_id = public.my_teacher_id()
        and (booked_by is null or booked_by = auth.uid()))
  );

-- What a climber may do to a slot: book a free future one (premium, one a month), or
-- cancel their own booking at least 24 hours before. Nothing else.
create function public.guard_call_slot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() or auth.uid() = old.coach_id then
    if new.booked_by is null then new.booked_at := null; end if;
    return new;
  end if;
  if new.coach_id is distinct from old.coach_id or new.starts_at is distinct from old.starts_at
     or new.minutes is distinct from old.minutes or new.room is distinct from old.room then
    raise exception 'only the coach can change a slot';
  end if;
  if old.booked_by is null and new.booked_by = auth.uid() then
    if public.plan_of(auth.uid()) <> 'premium' then
      raise exception 'video calls are part of the premium plan';
    end if;
    if new.starts_at <= now() then
      raise exception 'this slot has already started';
    end if;
    if exists (select 1 from public.call_slots c
               where c.booked_by = auth.uid() and c.id <> new.id
                 and date_trunc('month', c.starts_at) = date_trunc('month', new.starts_at)) then
      raise exception 'one video call per month';
    end if;
    new.booked_at := now();
  elsif old.booked_by = auth.uid() and new.booked_by is null then
    if old.starts_at < now() + interval '24 hours' then
      raise exception 'a booking can be cancelled up to 24 hours before';
    end if;
    new.booked_at := null;
  elsif new.booked_by is distinct from old.booked_by then
    raise exception 'not allowed';
  end if;
  return new;
end $$;

create trigger call_slots_guard
  before update on public.call_slots
  for each row execute function public.guard_call_slot();

revoke all on public.call_slots from anon;
